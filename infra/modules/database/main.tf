# PostgreSQL Flexible Server with private access only:
# - lives in a delegated subnet, no public endpoint
# - name resolution through a private DNS zone linked to the VNet
# - Entra ID authentication only (no passwords); the app's managed identity
#   is the Entra administrator

resource "azurerm_private_dns_zone" "this" {
  name                = "${var.name_prefix}.private.postgres.database.azure.com"
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "this" {
  name                 = "link-${var.name_prefix}"
  private_dns_zone_id  = azurerm_private_dns_zone.this.id
  virtual_network_id   = var.vnet_id
  registration_enabled = false
  tags                 = var.tags
}

resource "azurerm_postgresql_flexible_server" "this" {
  name                          = "psql-${var.name_prefix}-${var.name_suffix}"
  resource_group_name           = var.resource_group_name
  location                      = var.location
  version                       = var.postgres_version
  sku_name                      = var.sku_name
  storage_mb                    = var.storage_mb
  auto_grow_enabled             = true
  backup_retention_days         = var.backup_retention_days
  geo_redundant_backup_enabled  = var.geo_redundant_backup_enabled
  delegated_subnet_id           = var.delegated_subnet_id
  private_dns_zone_id           = azurerm_private_dns_zone.this.id
  public_network_access_enabled = false
  zone                          = var.zone

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = false
    tenant_id                     = var.tenant_id
  }

  dynamic "high_availability" {
    for_each = var.high_availability_enabled ? [1] : []
    content {
      mode                      = "ZoneRedundant"
      standby_availability_zone = var.standby_zone
    }
  }

  dynamic "maintenance_window" {
    for_each = var.maintenance_window == null ? [] : [var.maintenance_window]
    content {
      day_of_week  = maintenance_window.value.day_of_week
      start_hour   = maintenance_window.value.start_hour
      start_minute = maintenance_window.value.start_minute
    }
  }

  tags = var.tags

  # The VNet link must exist before the server is created.
  depends_on = [azurerm_private_dns_zone_virtual_network_link.this]

  lifecycle {
    # Deleting or replacing the server deletes its data. To tear down an
    # environment on purpose, remove this line first (see infra/README.md).
    prevent_destroy = true

    # After an HA failover Azure swaps primary and standby zones.
    ignore_changes = [
      zone,
      high_availability[0].standby_availability_zone,
    ]

    precondition {
      condition     = !(var.high_availability_enabled && startswith(var.sku_name, "B_"))
      error_message = "High availability is not available for Burstable (B_) SKUs."
    }
  }
}

# The app's user-assigned managed identity is the Entra administrator, so it can
# create its own tables at start. Least-privilege database roles are a later
# hardening step (see docs/deployment.md).
resource "azurerm_postgresql_flexible_server_active_directory_administrator" "app" {
  server_name         = azurerm_postgresql_flexible_server.this.name
  resource_group_name = var.resource_group_name
  tenant_id           = var.tenant_id
  object_id           = var.admin_principal_id
  principal_name      = var.admin_principal_name
  principal_type      = "ServicePrincipal"
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_postgresql_flexible_server_configuration" "this" {
  for_each = var.server_parameters

  name      = each.key
  server_id = azurerm_postgresql_flexible_server.this.id
  value     = each.value
}

module "diagnostics" {
  source = "../diagnostic_setting"

  target_resource_id         = azurerm_postgresql_flexible_server.this.id
  log_analytics_workspace_id = var.log_analytics_workspace_id
}
