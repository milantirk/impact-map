locals {
  environment = "prod"
}

data "azurerm_client_config" "current" {}

# Created by infra/bootstrap.
data "azurerm_resource_group" "env" {
  name = "rg-${var.project}-${local.environment}"
}

data "azurerm_container_registry" "shared" {
  name                = var.acr_name
  resource_group_name = var.acr_resource_group_name
}

locals {
  name_prefix = "${var.project}-${local.environment}"
  # Deterministic suffix for globally unique names (web app, server, endpoint).
  name_suffix = substr(sha256("${data.azurerm_client_config.current.subscription_id}/${local.name_prefix}"), 0, 6)
  location    = coalesce(var.location, data.azurerm_resource_group.env.location)

  tags = merge(var.tags, {
    app        = "impact-map"
    env        = local.environment
    managed_by = "terraform"
  })

  # Empty strings (for example from CI variables) mean "not set".
  custom_domain = trimspace(coalesce(var.custom_domain, " ")) == "" ? null : trimspace(var.custom_domain)
  alert_email   = trimspace(coalesce(var.alert_email, " ")) == "" ? null : trimspace(var.alert_email)
}

# -----------------------------------------------------------------------------
# App identity: pulls the image from ACR and logs in to PostgreSQL (Entra ID)
# -----------------------------------------------------------------------------

resource "azurerm_user_assigned_identity" "app" {
  name                = "id-${local.name_prefix}-app"
  resource_group_name = data.azurerm_resource_group.env.name
  location            = local.location
  tags                = local.tags
}

resource "azurerm_role_assignment" "app_acr_pull" {
  scope                            = data.azurerm_container_registry.shared.id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_user_assigned_identity.app.principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}

# -----------------------------------------------------------------------------
# Modules
# -----------------------------------------------------------------------------

module "network" {
  source = "../../modules/network"

  name_prefix         = local.name_prefix
  resource_group_name = data.azurerm_resource_group.env.name
  location            = local.location
  address_space       = var.vnet_address_space
  app_subnet_prefix   = var.app_subnet_prefix
  db_subnet_prefix    = var.db_subnet_prefix
  tags                = local.tags
}

module "monitoring" {
  source = "../../modules/monitoring"

  name_prefix           = local.name_prefix
  resource_group_name   = data.azurerm_resource_group.env.name
  location              = local.location
  log_retention_in_days = var.log_retention_in_days
  log_daily_quota_gb    = var.log_daily_quota_gb
  tags                  = local.tags
}

module "database" {
  source = "../../modules/database"

  name_prefix                  = local.name_prefix
  name_suffix                  = local.name_suffix
  resource_group_name          = data.azurerm_resource_group.env.name
  location                     = local.location
  vnet_id                      = module.network.vnet_id
  delegated_subnet_id          = module.network.db_subnet_id
  tenant_id                    = data.azurerm_client_config.current.tenant_id
  admin_principal_id           = azurerm_user_assigned_identity.app.principal_id
  admin_principal_name         = azurerm_user_assigned_identity.app.name
  postgres_version             = var.postgres_version
  sku_name                     = var.postgres_sku
  storage_mb                   = var.postgres_storage_mb
  backup_retention_days        = var.postgres_backup_retention_days
  geo_redundant_backup_enabled = var.postgres_geo_redundant_backup_enabled
  high_availability_enabled    = var.postgres_high_availability_enabled
  zone                         = var.postgres_zone
  standby_zone                 = var.postgres_standby_zone
  log_analytics_workspace_id   = module.monitoring.log_analytics_workspace_id
  tags                         = local.tags
}

module "front_door" {
  source = "../../modules/front_door"

  name_prefix                = local.name_prefix
  name_suffix                = local.name_suffix
  resource_group_name        = data.azurerm_resource_group.env.name
  sku_name                   = var.frontdoor_sku
  origin_host_name           = module.app_service.default_hostname
  waf_mode                   = var.waf_mode
  api_rate_limit_per_minute  = var.api_rate_limit_per_minute
  custom_domain              = local.custom_domain
  log_analytics_workspace_id = module.monitoring.log_analytics_workspace_id
  tags                       = local.tags
}

module "app_service" {
  source = "../../modules/app_service"

  name_prefix                            = local.name_prefix
  name_suffix                            = local.name_suffix
  resource_group_name                    = data.azurerm_resource_group.env.name
  location                               = local.location
  sku_name                               = var.app_service_sku
  worker_count                           = var.app_service_worker_count
  zone_balancing_enabled                 = var.app_service_zone_balancing_enabled
  staging_slot_enabled                   = var.staging_slot_enabled
  subnet_id                              = module.network.app_subnet_id
  identity_id                            = azurerm_user_assigned_identity.app.id
  identity_client_id                     = azurerm_user_assigned_identity.app.client_id
  identity_name                          = azurerm_user_assigned_identity.app.name
  acr_login_server                       = data.azurerm_container_registry.shared.login_server
  initial_image_tag                      = var.initial_image_tag
  front_door_profile_guid                = module.front_door.profile_resource_guid
  pg_host                                = module.database.fqdn
  pg_database                            = module.database.database_name
  application_insights_connection_string = module.monitoring.application_insights_connection_string
  log_level                              = var.log_level
  rate_limit_max                         = var.rate_limit_max
  log_analytics_workspace_id             = module.monitoring.log_analytics_workspace_id
  tags                                   = local.tags

  # The app must be able to pull its image as soon as it exists.
  depends_on = [azurerm_role_assignment.app_acr_pull]
}

module "alerts" {
  source = "../../modules/alerts"

  name_prefix                 = local.name_prefix
  resource_group_name         = data.azurerm_resource_group.env.name
  resource_group_id           = data.azurerm_resource_group.env.id
  location                    = local.location
  application_insights_id     = module.monitoring.application_insights_id
  availability_test_enabled   = var.availability_test_enabled
  availability_test_url       = "https://${module.front_door.endpoint_host_name}/healthz"
  availability_test_frequency = var.availability_test_frequency
  availability_test_locations = var.availability_test_locations
  alert_email                 = local.alert_email
  budget_amount               = var.budget_amount
  budget_contact_emails       = var.budget_contact_emails
  tags                        = local.tags
}
