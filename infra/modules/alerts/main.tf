# Optional alerting:
# - standard availability test on <front door>/healthz
# - e-mail action group + metric alert for the test (when alert_email is set)
# - monthly budget on the resource group (when budget_amount is set)

locals {
  alerting_enabled = var.alert_email != null
  budget_emails    = distinct(compact(concat(var.budget_contact_emails, var.alert_email == null ? [] : [var.alert_email])))
}

resource "azurerm_monitor_action_group" "this" {
  count = local.alerting_enabled ? 1 : 0

  name                = "ag-${var.name_prefix}"
  resource_group_name = var.resource_group_name
  short_name          = substr(replace(var.name_prefix, "-", ""), 0, 12)
  tags                = var.tags

  email_receiver {
    name                    = "primary"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
}

resource "azurerm_application_insights_standard_web_test" "healthz" {
  count = var.availability_test_enabled ? 1 : 0

  name                    = "webtest-${var.name_prefix}-healthz"
  resource_group_name     = var.resource_group_name
  location                = var.location
  application_insights_id = var.application_insights_id
  description             = "GET /healthz through Azure Front Door"
  enabled                 = true
  frequency               = var.availability_test_frequency
  timeout                 = 30
  retry_enabled           = true
  geo_locations           = var.availability_test_locations
  tags                    = var.tags

  request {
    url                              = var.availability_test_url
    http_verb                        = "GET"
    follow_redirects_enabled         = false
    parse_dependent_requests_enabled = false
  }

  validation_rules {
    expected_status_code        = 200
    ssl_check_enabled           = true
    ssl_cert_remaining_lifetime = 7
  }
}

resource "azurerm_monitor_metric_alert" "availability" {
  count = var.availability_test_enabled && local.alerting_enabled ? 1 : 0

  name                = "alert-${var.name_prefix}-availability"
  resource_group_name = var.resource_group_name
  description         = "/healthz fails from ${var.availability_failed_locations_threshold} or more test locations."
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"
  scopes = [
    azurerm_application_insights_standard_web_test.healthz[0].id,
    var.application_insights_id,
  ]
  tags = var.tags

  application_insights_web_test_location_availability_criteria {
    web_test_id           = azurerm_application_insights_standard_web_test.healthz[0].id
    component_id          = var.application_insights_id
    failed_location_count = var.availability_failed_locations_threshold
  }

  action {
    action_group_id = azurerm_monitor_action_group.this[0].id
  }
}

resource "azurerm_consumption_budget_resource_group" "this" {
  count = var.budget_amount == null ? 0 : 1

  name              = "budget-${var.name_prefix}"
  resource_group_id = var.resource_group_id
  amount            = var.budget_amount
  time_grain        = "Monthly"

  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", timestamp())
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = local.budget_emails
    contact_roles  = ["Owner"]
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThan"
    threshold_type = "Forecasted"
    contact_emails = local.budget_emails
    contact_roles  = ["Owner"]
  }

  lifecycle {
    # start_date is computed once at creation.
    ignore_changes = [time_period]
  }
}
