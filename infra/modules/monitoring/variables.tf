variable "name_prefix" {
  description = "Prefix used in resource names, for example impactmap-dev."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group for the monitoring resources."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
}

variable "log_retention_in_days" {
  description = "Retention of the Log Analytics workspace (30-730 days)."
  type        = number
  default     = 30

  validation {
    condition     = var.log_retention_in_days >= 30 && var.log_retention_in_days <= 730
    error_message = "log_retention_in_days must be between 30 and 730."
  }
}

variable "log_daily_quota_gb" {
  description = "Daily ingestion cap in GB. -1 means no cap."
  type        = number
  default     = -1
}

variable "tags" {
  description = "Tags for all resources."
  type        = map(string)
  default     = {}
}
