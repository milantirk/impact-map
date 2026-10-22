# Linux App Service that runs the API container (which also serves the SPA).
# - pulls the image from the shared ACR with the user-assigned identity
# - all outbound traffic goes through the VNet (private PostgreSQL)
# - inbound traffic only from this environment's Front Door profile

locals {
  app_name = "app-${var.name_prefix}-${var.name_suffix}"

  app_settings = merge(
    {
      NODE_ENV                              = "production"
      PORT                                  = "8080"
      WEBSITES_PORT                         = "8080"
      STATIC_DIR                            = "/app/public"
      TRUST_PROXY                           = "true"
      LOG_LEVEL                             = var.log_level
      RATE_LIMIT_MAX                        = tostring(var.rate_limit_max)
      DB_AUTH                               = "entra"
      PGHOST                                = var.pg_host
      PGPORT                                = "5432"
      PGDATABASE                            = var.pg_database
      PGUSER                                = var.identity_name
      PGSSLMODE                             = "require"
      AZURE_CLIENT_ID                       = var.identity_client_id
      APPLICATIONINSIGHTS_CONNECTION_STRING = var.application_insights_connection_string
      # The container does not need the shared /home storage.
      WEBSITES_ENABLE_APP_SERVICE_STORAGE = "false"
      # A slot swap only completes when every instance answers 200 here.
      WEBSITE_SWAP_WARMUP_PING_PATH     = var.health_check_path
      WEBSITE_SWAP_WARMUP_PING_STATUSES = "200"
    },
    var.extra_app_settings,
  )

  image_name = "${var.image_repository}:${var.initial_image_tag}"
}

resource "azurerm_service_plan" "this" {
  name                   = "asp-${var.name_prefix}"
  resource_group_name    = var.resource_group_name
  location               = var.location
  os_type                = "Linux"
  sku_name               = var.sku_name
  worker_count           = var.worker_count
  zone_balancing_enabled = var.zone_balancing_enabled
  tags                   = var.tags
}

resource "azurerm_linux_web_app" "this" {
  name                = local.app_name
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.this.id

  https_only                                     = true
  client_affinity_enabled                        = false
  public_network_access_enabled                  = true # reachable by Front Door only (see ip_restriction)
  virtual_network_subnet_id                      = var.subnet_id
  ftp_publish_basic_authentication_enabled       = false
  webdeploy_publish_basic_authentication_enabled = false

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity_id]
  }

  site_config {
    always_on                                     = var.always_on
    ftps_state                                    = "Disabled"
    http2_enabled                                 = true
    minimum_tls_version                           = "1.2"
    scm_minimum_tls_version                       = "1.2"
    health_check_path                             = var.health_check_path
    health_check_eviction_time_in_min             = 5
    vnet_route_all_enabled                        = true
    container_registry_use_managed_identity       = true
    container_registry_managed_identity_client_id = var.identity_client_id
    use_32_bit_worker                             = false
    websockets_enabled                            = false
    ip_restriction_default_action                 = "Deny"
    # Deployments use the ARM API only; the Kudu (SCM) site stays closed.
    scm_ip_restriction_default_action = "Deny"
    scm_use_main_ip_restriction       = false

    ip_restriction {
      name        = "AllowFrontDoor"
      description = "Only requests from this environment's Front Door profile"
      priority    = 100
      action      = "Allow"
      service_tag = "AzureFrontDoor.Backend"

      headers {
        x_azure_fdid = [var.front_door_profile_guid]
      }
    }

    application_stack {
      docker_image_name   = local.image_name
      docker_registry_url = "https://${var.acr_login_server}"
    }
  }

  app_settings = local.app_settings
  tags         = var.tags

  lifecycle {
    # The deploy workflows change the image tag; Terraform must not roll it back.
    ignore_changes = [
      site_config[0].application_stack[0].docker_image_name,
    ]
  }
}

resource "azurerm_linux_web_app_slot" "staging" {
  count = var.staging_slot_enabled ? 1 : 0

  name           = "staging"
  app_service_id = azurerm_linux_web_app.this.id

  https_only                                     = true
  client_affinity_enabled                        = false
  public_network_access_enabled                  = true
  virtual_network_subnet_id                      = var.subnet_id
  ftp_publish_basic_authentication_enabled       = false
  webdeploy_publish_basic_authentication_enabled = false

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity_id]
  }

  site_config {
    always_on                                     = var.always_on
    ftps_state                                    = "Disabled"
    http2_enabled                                 = true
    minimum_tls_version                           = "1.2"
    scm_minimum_tls_version                       = "1.2"
    health_check_path                             = var.health_check_path
    health_check_eviction_time_in_min             = 5
    vnet_route_all_enabled                        = true
    container_registry_use_managed_identity       = true
    container_registry_managed_identity_client_id = var.identity_client_id
    use_32_bit_worker                             = false
    websockets_enabled                            = false
    ip_restriction_default_action                 = "Deny"
    scm_ip_restriction_default_action             = "Deny"
    scm_use_main_ip_restriction                   = false

    ip_restriction {
      name        = "AllowFrontDoor"
      description = "Only requests from this environment's Front Door profile"
      priority    = 100
      action      = "Allow"
      service_tag = "AzureFrontDoor.Backend"

      headers {
        x_azure_fdid = [var.front_door_profile_guid]
      }
    }

    application_stack {
      docker_image_name   = local.image_name
      docker_registry_url = "https://${var.acr_login_server}"
    }
  }

  app_settings = local.app_settings
  tags         = var.tags

  lifecycle {
    ignore_changes = [
      site_config[0].application_stack[0].docker_image_name,
    ]
  }
}

module "diagnostics_app" {
  source = "../diagnostic_setting"

  target_resource_id         = azurerm_linux_web_app.this.id
  log_analytics_workspace_id = var.log_analytics_workspace_id
  log_categories             = var.diagnostic_log_categories
}

module "diagnostics_slot" {
  source = "../diagnostic_setting"
  count  = var.staging_slot_enabled ? 1 : 0

  target_resource_id         = azurerm_linux_web_app_slot.staging[0].id
  log_analytics_workspace_id = var.log_analytics_workspace_id
  log_categories             = var.diagnostic_log_categories
}
