variable "name" {
  description = "Name of the diagnostic setting."
  type        = string
  default     = "send-to-log-analytics"
}

variable "target_resource_id" {
  description = "ID of the resource whose platform logs and metrics are exported."
  type        = string
}

variable "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace that receives the data."
  type        = string
}

variable "log_categories" {
  description = "Log categories to enable. Categories the resource does not support are skipped. null enables every supported category."
  type        = list(string)
  default     = null
}

variable "metrics_enabled" {
  description = "Export all platform metric categories as well."
  type        = bool
  default     = true
}
