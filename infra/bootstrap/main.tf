data "azurerm_client_config" "current" {}

data "azurerm_subscription" "current" {}

locals {
  # Deterministic suffix for globally unique names: same subscription and
  # project give the same names (helps when state has to be rebuilt).
  suffix = substr(sha256("${data.azurerm_client_config.current.subscription_id}/${var.project}"), 0, 6)

  tags = merge(var.tags, {
    app        = "impact-map"
    env        = "shared"
    managed_by = "terraform"
  })

  github_subject_prefix = "repo:${var.github_owner}/${var.github_repository}"

  # One deployment identity per environment, plus a read-only identity for
  # pull request plans.
  github_identities = merge(
    { for env in var.environments : env => "${local.github_subject_prefix}:environment:${env}" },
    { plan = "${local.github_subject_prefix}:pull_request" },
  )

  # Built-in role definition IDs used in the ABAC conditions.
  role_id_acr_pull                     = "7f951dda-4ed3-4680-a7ca-43fe172d538d"
  role_id_monitoring_metrics_publisher = "3913510d-42f4-4e42-8a64-420c390055eb"

  # The deployment identities may only assign these roles, and only to
  # service principals (managed identities).
  rbac_condition_env_rg = trimspace(templatefile("${path.module}/templates/rbac-condition.tftpl", {
    role_ids = [local.role_id_acr_pull, local.role_id_monitoring_metrics_publisher]
  }))
  rbac_condition_acr = trimspace(templatefile("${path.module}/templates/rbac-condition.tftpl", {
    role_ids = [local.role_id_acr_pull]
  }))

  state_admin_principal_ids = toset(concat([data.azurerm_client_config.current.object_id], var.state_admin_principal_ids))
}

# -----------------------------------------------------------------------------
# Resource groups
# -----------------------------------------------------------------------------

resource "azurerm_resource_group" "shared" {
  name     = "rg-${var.project}-shared"
  location = var.location
  tags     = local.tags
}

resource "azurerm_resource_group" "env" {
  for_each = toset(var.environments)

  name     = "rg-${var.project}-${each.key}"
  location = var.location
  tags     = merge(local.tags, { env = each.key })
}

# -----------------------------------------------------------------------------
# Terraform state storage (Entra ID only, versioned, soft delete)
# -----------------------------------------------------------------------------

resource "azurerm_storage_account" "tfstate" {
  name                              = "st${var.project}tf${local.suffix}"
  resource_group_name               = azurerm_resource_group.shared.name
  location                          = azurerm_resource_group.shared.location
  account_kind                      = "StorageV2"
  account_tier                      = "Standard"
  account_replication_type          = var.tfstate_replication_type
  access_tier                       = "Hot"
  https_traffic_only_enabled        = true
  min_tls_version                   = "TLS1_2"
  shared_access_key_enabled         = false
  default_to_oauth_authentication   = true
  allow_nested_items_to_be_public   = false
  cross_tenant_replication_enabled  = false
  infrastructure_encryption_enabled = true
  local_user_enabled                = false
  sftp_enabled                      = false
  allowed_copy_scope                = "AAD"
  # GitHub-hosted runners have changing IP addresses. Every request still needs
  # an Entra ID token and an RBAC role on the container.
  public_network_access = "Enabled"

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = var.tfstate_soft_delete_days
    }

    container_delete_retention_policy {
      days = var.tfstate_soft_delete_days
    }
  }

  tags = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.tfstate.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_management_lock" "tfstate" {
  name       = "do-not-delete-terraform-state"
  scope      = azurerm_storage_account.tfstate.id
  lock_level = "CanNotDelete"
  notes      = "Holds the Terraform state of all Impact Map stacks."
}

# The person who runs bootstrap (and optional extra admins) can read and write
# state, for example to migrate this stack's local state.
resource "azurerm_role_assignment" "state_admins" {
  for_each = local.state_admin_principal_ids

  scope                = azurerm_storage_container.tfstate.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = each.value
}

# -----------------------------------------------------------------------------
# Shared container registry: build once, promote the same image digest
# -----------------------------------------------------------------------------

resource "azurerm_container_registry" "shared" {
  name                          = "cr${var.project}${local.suffix}"
  resource_group_name           = azurerm_resource_group.shared.name
  location                      = azurerm_resource_group.shared.location
  sku                           = var.acr_sku
  admin_enabled                 = false
  public_network_access_enabled = true
  tags                          = local.tags
}

# -----------------------------------------------------------------------------
# GitHub Actions OIDC identities (no secrets)
# -----------------------------------------------------------------------------

# These identities live in the shared resource group, so a deployment identity
# cannot change its own federated credentials.
resource "azurerm_user_assigned_identity" "github" {
  for_each = local.github_identities

  name                = "id-${var.project}-github-${each.key}"
  resource_group_name = azurerm_resource_group.shared.name
  location            = azurerm_resource_group.shared.location
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "github" {
  for_each = local.github_identities

  name                      = "github-${each.key}"
  user_assigned_identity_id = azurerm_user_assigned_identity.github[each.key].id
  issuer                    = "https://token.actions.githubusercontent.com"
  audience                  = ["api://AzureADTokenExchange"]
  subject                   = each.value
}

# --- Deployment identities (one per environment) -----------------------------

resource "azurerm_role_assignment" "env_contributor" {
  for_each = azurerm_resource_group.env

  scope                = each.value.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "env_rbac_admin" {
  for_each = azurerm_resource_group.env

  scope                = each.value.id
  role_definition_name = "Role Based Access Control Administrator"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
  description          = "May only assign AcrPull and Monitoring Metrics Publisher to service principals."
  condition_version    = "2.0"
  condition            = local.rbac_condition_env_rg
}

# The env stack gives the app identity AcrPull on the shared registry. This
# needs role assignment rights on the registry, limited to AcrPull.
resource "azurerm_role_assignment" "env_rbac_admin_acr" {
  for_each = azurerm_resource_group.env

  scope                = azurerm_container_registry.shared.id
  role_definition_name = "Role Based Access Control Administrator"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
  description          = "May only assign AcrPull to service principals."
  condition_version    = "2.0"
  condition            = local.rbac_condition_acr
}

resource "azurerm_role_assignment" "env_acr_push" {
  for_each = azurerm_resource_group.env

  scope                = azurerm_container_registry.shared.id
  role_definition_name = "AcrPush"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
}

# Read the registry resource (Terraform data source, az acr login).
resource "azurerm_role_assignment" "env_acr_reader" {
  for_each = azurerm_resource_group.env

  scope                = azurerm_container_registry.shared.id
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "env_state" {
  for_each = azurerm_resource_group.env

  scope                = azurerm_storage_container.tfstate.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
}

# --- Plan identity (pull requests, read only) ---------------------------------

# Reader cannot run "terraform plan" for web apps: the provider must list app
# settings during refresh. This role adds only the list actions it needs.
resource "azurerm_role_definition" "plan_reader" {
  name        = "${var.project} terraform plan reader"
  scope       = data.azurerm_subscription.current.id
  description = "Read-only access for terraform plan, plus the list actions the azurerm provider needs to refresh state."

  permissions {
    actions = [
      "*/read",
      "Microsoft.Web/sites/config/list/action",
      "Microsoft.Web/sites/slots/config/list/action",
      "Microsoft.OperationalInsights/workspaces/sharedKeys/action",
    ]
  }

  assignable_scopes = concat(
    [for rg in azurerm_resource_group.env : rg.id],
    [azurerm_resource_group.shared.id],
  )
}

resource "azurerm_role_assignment" "plan_reader_env" {
  for_each = azurerm_resource_group.env

  scope              = each.value.id
  role_definition_id = azurerm_role_definition.plan_reader.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github["plan"].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "plan_reader_acr" {
  scope              = azurerm_container_registry.shared.id
  role_definition_id = azurerm_role_definition.plan_reader.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github["plan"].principal_id
  principal_type     = "ServicePrincipal"
}

# Plans run with -lock=false, so read access to the state is enough.
resource "azurerm_role_assignment" "plan_state_reader" {
  scope                = azurerm_storage_container.tfstate.id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.github["plan"].principal_id
  principal_type       = "ServicePrincipal"
}
