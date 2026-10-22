output "id" {
  description = "ID of the diagnostic setting."
  value       = azurerm_monitor_diagnostic_setting.this.id
}

output "enabled_log_categories" {
  description = "Log categories that are exported."
  value       = local.logs
}
