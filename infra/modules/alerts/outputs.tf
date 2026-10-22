output "action_group_id" {
  description = "ID of the e-mail action group, or null."
  value       = local.alerting_enabled ? azurerm_monitor_action_group.this[0].id : null
}

output "availability_test_id" {
  description = "ID of the availability test, or null."
  value       = var.availability_test_enabled ? azurerm_application_insights_standard_web_test.healthz[0].id : null
}

output "budget_id" {
  description = "ID of the budget, or null."
  value       = var.budget_amount == null ? null : azurerm_consumption_budget_resource_group.this[0].id
}
