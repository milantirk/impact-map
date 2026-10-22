output "vnet_id" {
  description = "ID of the virtual network."
  value       = azurerm_virtual_network.this.id
}

output "vnet_name" {
  description = "Name of the virtual network."
  value       = azurerm_virtual_network.this.name
}

output "app_subnet_id" {
  description = "ID of the App Service integration subnet."
  value       = azurerm_subnet.app.id
}

output "db_subnet_id" {
  description = "ID of the PostgreSQL delegated subnet."
  value       = azurerm_subnet.db.id
}
