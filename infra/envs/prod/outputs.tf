output "resource_group_name" {
  description = "Resource group of this environment."
  value       = data.azurerm_resource_group.env.name
}

output "app_service_name" {
  description = "Name of the web app."
  value       = module.app_service.app_name
}

output "staging_slot_name" {
  description = "Name of the staging slot, or null."
  value       = module.app_service.staging_slot_name
}

output "frontdoor_endpoint_hostname" {
  description = "Public host name (azurefd.net) of the app."
  value       = module.front_door.endpoint_host_name
}

output "acr_login_server" {
  description = "Login server of the shared container registry."
  value       = data.azurerm_container_registry.shared.login_server
}

output "app_identity_client_id" {
  description = "Client ID of the app's managed identity (AZURE_CLIENT_ID in the app)."
  value       = azurerm_user_assigned_identity.app.client_id
}

output "app_identity_name" {
  description = "Name of the app's managed identity (PGUSER in the app)."
  value       = azurerm_user_assigned_identity.app.name
}

output "postgres_fqdn" {
  description = "Private host name of PostgreSQL."
  value       = module.database.fqdn
}

output "custom_domain_validation_token" {
  description = "TXT record value for _dnsauth.<custom domain>, or null."
  value       = module.front_door.custom_domain_validation_token
}

output "custom_domain_cname_target" {
  description = "CNAME target for the custom domain, or null."
  value       = module.front_door.custom_domain_cname_target
}

# Keys are the exact GitHub environment variable names (see docs/deployment.md).
output "github_environment_variables" {
  description = "GitHub environment variables for this environment that come from this stack."
  value = {
    AZURE_WEBAPP_NAME  = module.app_service.app_name
    FRONTDOOR_HOSTNAME = module.front_door.endpoint_host_name
  }
}
