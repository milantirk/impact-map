# Exports platform logs and metrics of one resource to Log Analytics.
# The supported categories differ per resource type and SKU, so they are read
# from Azure and intersected with the wanted list. This avoids apply errors
# such as "Category 'X' is not supported".

data "azurerm_monitor_diagnostic_categories" "this" {
  resource_id = var.target_resource_id
}

locals {
  supported_logs = toset(data.azurerm_monitor_diagnostic_categories.this.log_category_types)
  logs           = var.log_categories == null ? local.supported_logs : setintersection(local.supported_logs, toset(var.log_categories))
  metrics        = var.metrics_enabled ? toset(data.azurerm_monitor_diagnostic_categories.this.metrics) : toset([])
}

resource "azurerm_monitor_diagnostic_setting" "this" {
  name                       = var.name
  target_resource_id         = var.target_resource_id
  log_analytics_workspace_id = var.log_analytics_workspace_id

  dynamic "enabled_log" {
    for_each = local.logs
    content {
      category = enabled_log.value
    }
  }

  dynamic "enabled_metric" {
    for_each = local.metrics
    content {
      category = enabled_metric.value
    }
  }
}
