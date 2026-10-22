provider "azurerm" {
  subscription_id = var.subscription_id

  # Resource providers are registered once by infra/bootstrap. The deployment
  # identity has no subscription-level rights to register them.
  resource_provider_registrations = "none"

  features {
    resource_group {
      prevent_deletion_if_contains_resources = true
    }

    application_insights {
      # Keep the "Failure Anomalies" smart detection rule.
      disable_generated_rule = false
    }

    log_analytics_workspace {
      # A destroyed workspace stays recoverable for 14 days.
      permanently_delete_on_destroy = false
    }

    postgresql_flexible_server {
      restart_server_on_configuration_value_change = true
    }
  }
}
