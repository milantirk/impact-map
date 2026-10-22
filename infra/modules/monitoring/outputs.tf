output "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace."
  value       = azurerm_log_analytics_workspace.this.id
}

output "application_insights_id" {
  description = "ID of the Application Insights component."
  value       = azurerm_application_insights.this.id
}

output "application_insights_name" {
  description = "Name of the Application Insights component."
  value       = azurerm_application_insights.this.name
}

output "application_insights_connection_string" {
  description = "Connection string of the Application Insights component."
  value       = azurerm_application_insights.this.connection_string
  sensitive   = true
}
