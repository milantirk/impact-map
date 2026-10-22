locals {
  github_repo = "${var.github_owner}/${var.github_repository}"

  # Keys are the exact GitHub variable names (see docs/deployment.md).
  github_repository_variables = {
    AZURE_TENANT_ID         = data.azurerm_client_config.current.tenant_id
    AZURE_SUBSCRIPTION_ID   = data.azurerm_client_config.current.subscription_id
    AZURE_PLAN_CLIENT_ID    = azurerm_user_assigned_identity.github["plan"].client_id
    ACR_NAME                = azurerm_container_registry.shared.name
    TFSTATE_STORAGE_ACCOUNT = azurerm_storage_account.tfstate.name
    TFSTATE_CONTAINER       = azurerm_storage_container.tfstate.name
  }

  github_environment_variables = {
    for env in var.environments : env => {
      AZURE_CLIENT_ID      = azurerm_user_assigned_identity.github[env].client_id
      AZURE_RESOURCE_GROUP = azurerm_resource_group.env[env].name
    }
  }
}

output "azure_tenant_id" {
  description = "Entra ID tenant ID."
  value       = data.azurerm_client_config.current.tenant_id
}

output "azure_subscription_id" {
  description = "Subscription ID."
  value       = data.azurerm_client_config.current.subscription_id
}

output "acr_name" {
  description = "Name of the shared container registry."
  value       = azurerm_container_registry.shared.name
}

output "acr_login_server" {
  description = "Login server of the shared container registry."
  value       = azurerm_container_registry.shared.login_server
}

output "environment_resource_groups" {
  description = "Resource group per environment."
  value       = { for env, rg in azurerm_resource_group.env : env => rg.name }
}

output "github_repository_variables" {
  description = "Repository variables: Settings > Secrets and variables > Actions > Variables."
  value       = local.github_repository_variables
}

output "github_environment_variables" {
  description = "Environment variables: Settings > Environments > <env>. AZURE_WEBAPP_NAME and FRONTDOOR_HOSTNAME come from the env stack outputs."
  value       = local.github_environment_variables
}

output "gh_cli_commands" {
  description = "GitHub CLI commands that set the variables above (create the environments first)."
  value = concat(
    [for name, value in local.github_repository_variables : "gh variable set ${name} --repo ${local.github_repo} --body '${value}'"],
    flatten([
      for env, variables in local.github_environment_variables : [
        for name, value in variables : "gh variable set ${name} --repo ${local.github_repo} --env ${env} --body '${value}'"
      ]
    ]),
  )
}

output "backend_hcl" {
  description = "Content of backend.hcl for each stack (bootstrap state migration and env stacks)."
  value = {
    for stack in concat(["bootstrap"], var.environments) : stack => join("\n", [
      "storage_account_name = \"${azurerm_storage_account.tfstate.name}\"",
      "container_name       = \"${azurerm_storage_container.tfstate.name}\"",
      "key                  = \"${stack}.tfstate\"",
      "use_azuread_auth     = true",
      "",
    ])
  }
}
