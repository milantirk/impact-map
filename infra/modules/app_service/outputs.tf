output "service_plan_id" {
  description = "ID of the App Service plan."
  value       = azurerm_service_plan.this.id
}

output "app_id" {
  description = "ID of the web app."
  value       = azurerm_linux_web_app.this.id
}

output "app_name" {
  description = "Name of the web app."
  value       = azurerm_linux_web_app.this.name
}

output "default_hostname" {
  description = "Default host name of the web app (the Front Door origin)."
  value       = azurerm_linux_web_app.this.default_hostname
}

output "staging_slot_name" {
  description = "Name of the staging slot, or null when there is no slot."
  value       = var.staging_slot_enabled ? azurerm_linux_web_app_slot.staging[0].name : null
}

output "staging_slot_hostname" {
  description = "Default host name of the staging slot, or null."
  value       = var.staging_slot_enabled ? azurerm_linux_web_app_slot.staging[0].default_hostname : null
}
