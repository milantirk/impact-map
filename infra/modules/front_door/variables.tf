variable "name_prefix" {
  description = "Prefix used in resource names, for example impactmap-dev."
  type        = string
}

variable "name_suffix" {
  description = "Short suffix for the endpoint name."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group for the Front Door resources."
  type        = string
}

variable "sku_name" {
  description = "Standard_AzureFrontDoor or Premium_AzureFrontDoor. Managed WAF rule sets need Premium."
  type        = string

  validation {
    condition     = contains(["Standard_AzureFrontDoor", "Premium_AzureFrontDoor"], var.sku_name)
    error_message = "sku_name must be Standard_AzureFrontDoor or Premium_AzureFrontDoor."
  }
}

variable "origin_host_name" {
  description = "Host name of the origin (the App Service default host name)."
  type        = string
}

variable "waf_mode" {
  description = "Detection (log only) or Prevention (block)."
  type        = string

  validation {
    condition     = contains(["Detection", "Prevention"], var.waf_mode)
    error_message = "waf_mode must be Detection or Prevention."
  }
}

variable "api_rate_limit_per_minute" {
  description = "Requests per minute per client IP to /api/ before the WAF blocks."
  type        = number
  default     = 300
}

variable "health_probe_enabled" {
  description = "Probe the origin. Microsoft recommends no probes when an origin group has a single origin."
  type        = bool
  default     = false
}

variable "custom_domain" {
  description = "Optional custom host name, for example impact-map.example.com. null = only the azurefd.net endpoint."
  type        = string
  default     = null
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace for access and WAF logs."
  type        = string
}

variable "tags" {
  description = "Tags for all resources."
  type        = map(string)
  default     = {}
}
