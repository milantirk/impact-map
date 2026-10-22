variable "name_prefix" {
  description = "Prefix used in resource names, for example impactmap-dev."
  type        = string
}

variable "name_suffix" {
  description = "Short suffix that makes the globally unique app name unique."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group for the App Service resources."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
}

variable "sku_name" {
  description = "App Service plan SKU, for example B1 or P1v3."
  type        = string
}

variable "worker_count" {
  description = "Number of plan instances."
  type        = number
  default     = 1
}

variable "zone_balancing_enabled" {
  description = "Spread instances across availability zones (Premium v3 and at least 2 instances; region must support it)."
  type        = bool
  default     = false
}

variable "always_on" {
  description = "Keep the app loaded. Supported from the Basic tier."
  type        = bool
  default     = true
}

variable "staging_slot_enabled" {
  description = "Create a 'staging' deployment slot (Standard tier or higher)."
  type        = bool
  default     = false
}

variable "subnet_id" {
  description = "ID of the subnet used for outbound VNet integration."
  type        = string
}

variable "identity_id" {
  description = "Resource ID of the user-assigned managed identity of the app."
  type        = string
}

variable "identity_client_id" {
  description = "Client ID of that identity (ACR pull and AZURE_CLIENT_ID)."
  type        = string
}

variable "identity_name" {
  description = "Name of that identity. PostgreSQL knows the identity by this name (PGUSER)."
  type        = string
}

variable "acr_login_server" {
  description = "Login server of the shared container registry, for example crimpactmapabc123.azurecr.io."
  type        = string
}

variable "image_repository" {
  description = "Repository of the app image in the registry."
  type        = string
  default     = "impact-map"
}

variable "initial_image_tag" {
  description = "Image tag used when the app is created. The deploy workflows own the tag afterwards (Terraform ignores later changes)."
  type        = string
  default     = "bootstrap"
}

variable "front_door_profile_guid" {
  description = "resource_guid of the Front Door profile. Only requests with this X-Azure-FDID header are allowed."
  type        = string
}

variable "pg_host" {
  description = "PostgreSQL host name."
  type        = string
}

variable "pg_database" {
  description = "PostgreSQL database name."
  type        = string
}

variable "application_insights_connection_string" {
  description = "Application Insights connection string."
  type        = string
  sensitive   = true
}

variable "health_check_path" {
  description = "Liveness path used by the App Service health check and by slot swap warm-up."
  type        = string
  default     = "/healthz"
}

variable "log_level" {
  description = "LOG_LEVEL of the API."
  type        = string
  default     = "info"
}

variable "rate_limit_max" {
  description = "RATE_LIMIT_MAX of the API."
  type        = number
  default     = 120
}

variable "extra_app_settings" {
  description = "Additional app settings. They override the defaults of this module."
  type        = map(string)
  default     = {}
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace for platform logs."
  type        = string
}

variable "diagnostic_log_categories" {
  description = "App Service log categories to export (unsupported ones are skipped)."
  type        = list(string)
  default = [
    "AppServiceHTTPLogs",
    "AppServiceConsoleLogs",
    "AppServiceAppLogs",
    "AppServicePlatformLogs",
  ]
}

variable "tags" {
  description = "Tags for all resources."
  type        = map(string)
  default     = {}
}
