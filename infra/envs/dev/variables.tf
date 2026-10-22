# Defaults are the dev sizing. GitHub Actions passes extra values from the
# repository variable TFVARS_DEV (JSON); local runs use terraform.tfvars.

variable "subscription_id" {
  description = "Target subscription. null uses ARM_SUBSCRIPTION_ID or the current Azure CLI subscription."
  type        = string
  default     = null
}

variable "project" {
  description = "Project name used in resource names. Must match infra/bootstrap."
  type        = string
  default     = "impactmap"
}

variable "location" {
  description = "Azure region. null uses the region of the environment resource group."
  type        = string
  default     = null
}

variable "acr_name" {
  description = "Name of the shared container registry (bootstrap output acr_name)."
  type        = string
}

variable "acr_resource_group_name" {
  description = "Resource group of the shared container registry."
  type        = string
  default     = "rg-impactmap-shared"
}

variable "tags" {
  description = "Extra tags for all resources."
  type        = map(string)
  default     = {}
}

# --- Network -----------------------------------------------------------------

variable "vnet_address_space" {
  description = "Address space of the environment VNet."
  type        = list(string)
  default     = ["10.20.0.0/16"]
}

variable "app_subnet_prefix" {
  description = "Subnet for App Service VNet integration."
  type        = string
  default     = "10.20.1.0/24"
}

variable "db_subnet_prefix" {
  description = "Subnet delegated to PostgreSQL Flexible Server."
  type        = string
  default     = "10.20.2.0/24"
}

# --- App Service -------------------------------------------------------------

variable "app_service_sku" {
  description = "App Service plan SKU."
  type        = string
  default     = "B1"
}

variable "app_service_worker_count" {
  description = "Number of App Service plan instances."
  type        = number
  default     = 1
}

variable "app_service_zone_balancing_enabled" {
  description = "Spread instances across availability zones (Premium v3, 2+ instances)."
  type        = bool
  default     = false
}

variable "staging_slot_enabled" {
  description = "Create a 'staging' slot and deploy through slot swap (Standard tier or higher)."
  type        = bool
  default     = false
}

variable "initial_image_tag" {
  description = "Image tag used only when the web app is created. Deployments set the real tag."
  type        = string
  default     = "bootstrap"
}

variable "log_level" {
  description = "LOG_LEVEL of the API."
  type        = string
  default     = "debug"
}

variable "rate_limit_max" {
  description = "RATE_LIMIT_MAX of the API (application-level rate limit)."
  type        = number
  default     = 120
}

# --- Front Door ----------------------------------------------------------------

variable "frontdoor_sku" {
  description = "Standard_AzureFrontDoor or Premium_AzureFrontDoor."
  type        = string
  default     = "Standard_AzureFrontDoor"
}

variable "waf_mode" {
  description = "WAF mode: Detection or Prevention."
  type        = string
  default     = "Detection"
}

variable "api_rate_limit_per_minute" {
  description = "WAF rate limit for /api/ per client IP and minute."
  type        = number
  default     = 300
}

variable "custom_domain" {
  description = "Optional custom domain on Front Door (managed certificate). null or empty = none."
  type        = string
  default     = null
}

# --- PostgreSQL --------------------------------------------------------------

variable "postgres_sku" {
  description = "PostgreSQL Flexible Server SKU."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "postgres_version" {
  description = "PostgreSQL major version."
  type        = string
  default     = "17"
}

variable "postgres_storage_mb" {
  description = "PostgreSQL storage in MB (auto-grow is on)."
  type        = number
  default     = 32768
}

variable "postgres_backup_retention_days" {
  description = "Backup retention (point-in-time restore window) in days."
  type        = number
  default     = 7
}

variable "postgres_geo_redundant_backup_enabled" {
  description = "Geo-redundant backups. Can only be set when the server is created."
  type        = bool
  default     = false
}

variable "postgres_high_availability_enabled" {
  description = "Zone-redundant high availability."
  type        = bool
  default     = false
}

variable "postgres_zone" {
  description = "Availability zone of the primary server. null lets Azure choose."
  type        = string
  default     = null
}

variable "postgres_standby_zone" {
  description = "Availability zone of the HA standby. null lets Azure choose."
  type        = string
  default     = null
}

# --- Monitoring and alerts -----------------------------------------------------

variable "log_retention_in_days" {
  description = "Log Analytics retention in days."
  type        = number
  default     = 30
}

variable "log_daily_quota_gb" {
  description = "Daily Log Analytics ingestion cap in GB (-1 = no cap)."
  type        = number
  default     = 1
}

variable "availability_test_enabled" {
  description = "Create the /healthz availability test."
  type        = bool
  default     = true
}

variable "availability_test_frequency" {
  description = "Seconds between availability test runs (300, 600 or 900)."
  type        = number
  default     = 900
}

variable "availability_test_locations" {
  description = "Availability test locations."
  type        = list(string)
  default     = ["emea-nl-ams-azr", "us-va-ash-azr", "apac-sg-sin-azr"]
}

variable "alert_email" {
  description = "E-mail for availability alerts. null or empty = no alerts."
  type        = string
  default     = null
}

variable "budget_amount" {
  description = "Monthly budget for the resource group. null = no budget."
  type        = number
  default     = null
}

variable "budget_contact_emails" {
  description = "Extra e-mails for budget notifications."
  type        = list(string)
  default     = []
}
