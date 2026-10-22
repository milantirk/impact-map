output "server_id" {
  description = "ID of the PostgreSQL Flexible Server."
  value       = azurerm_postgresql_flexible_server.this.id
}

output "server_name" {
  description = "Name of the PostgreSQL Flexible Server."
  value       = azurerm_postgresql_flexible_server.this.name
}

output "fqdn" {
  description = "Host name of the server. It resolves to a private IP inside the VNet."
  value       = azurerm_postgresql_flexible_server.this.fqdn

  # Consumers (the web app) must not start before the app identity can log in.
  depends_on = [azurerm_postgresql_flexible_server_active_directory_administrator.app]
}

output "database_name" {
  description = "Name of the application database."
  value       = azurerm_postgresql_flexible_server_database.app.name
}
