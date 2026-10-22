variable "name_prefix" {
  description = "Prefix used in resource names, for example impactmap-dev."
  type        = string
}

variable "name_suffix" {
  description = "Short suffix that makes the globally unique server name unique."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group for the database resources."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
}

variable "vnet_id" {
  description = "ID of the virtual network that is linked to the private DNS zone."
  type        = string
}

variable "delegated_subnet_id" {
  description = "ID of the subnet delegated to Microsoft.DBforPostgreSQL/flexibleServers."
  type        = string
}

variable "tenant_id" {
  description = "Entra ID tenant used for database authentication."
  type        = string
}

variable "admin_principal_id" {
  description = "Object (principal) ID of the managed identity that becomes the Entra administrator."
  type        = string
}

variable "admin_principal_name" {
  description = "Name of that managed identity. The app uses it as PGUSER."
  type        = string
}

variable "postgres_version" {
  description = "Major PostgreSQL version."
  type        = string
  default     = "17"
}

variable "sku_name" {
  description = "Compute SKU, for example B_Standard_B1ms or GP_Standard_D2ds_v5."
  type        = string
}

variable "storage_mb" {
  description = "Storage size in MB. Auto-grow is on."
  type        = number
  default     = 32768
}

variable "backup_retention_days" {
  description = "Point-in-time restore window in days (7-35)."
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 35
    error_message = "backup_retention_days must be between 7 and 35."
  }
}

variable "geo_redundant_backup_enabled" {
  description = "Copy backups to the paired region. Can only be set when the server is created."
  type        = bool
  default     = false
}

variable "high_availability_enabled" {
  description = "Zone-redundant high availability (standby in another zone). Not available for Burstable SKUs."
  type        = bool
  default     = false
}

variable "zone" {
  description = "Availability zone of the primary server. null lets Azure choose."
  type        = string
  default     = null
}

variable "standby_zone" {
  description = "Availability zone of the HA standby. null lets Azure choose."
  type        = string
  default     = null
}

variable "maintenance_window" {
  description = "Planned maintenance window (UTC). day_of_week: 0 = Sunday. null uses the system-managed window."
  type = object({
    day_of_week  = number
    start_hour   = number
    start_minute = number
  })
  default = null
}

variable "database_name" {
  description = "Name of the application database."
  type        = string
  default     = "impactmap"
}

variable "server_parameters" {
  description = "Server parameters to set."
  type        = map(string)
  default = {
    require_secure_transport = "on"
    log_checkpoints          = "on"
    log_connections          = "on"
    log_disconnections       = "on"
  }
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace for server logs and metrics."
  type        = string
}

variable "tags" {
  description = "Tags for all resources."
  type        = map(string)
  default     = {}
}
