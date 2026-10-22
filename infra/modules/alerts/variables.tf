variable "name_prefix" {
  description = "Prefix used in resource names, for example impactmap-dev."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group for the alert resources."
  type        = string
}

variable "resource_group_id" {
  description = "ID of the resource group that the budget watches."
  type        = string
}

variable "location" {
  description = "Azure region of the Application Insights component."
  type        = string
}

variable "application_insights_id" {
  description = "ID of the Application Insights component that runs the availability test."
  type        = string
}

variable "availability_test_enabled" {
  description = "Create a standard availability test."
  type        = bool
  default     = true
}

variable "availability_test_url" {
  description = "URL that the availability test calls."
  type        = string
}

variable "availability_test_frequency" {
  description = "Seconds between test runs: 300, 600 or 900."
  type        = number
  default     = 300

  validation {
    condition     = contains([300, 600, 900], var.availability_test_frequency)
    error_message = "availability_test_frequency must be 300, 600 or 900."
  }
}

variable "availability_test_locations" {
  description = "Test locations (Application Insights location IDs). Microsoft recommends at least 5."
  type        = list(string)
  default = [
    "emea-nl-ams-azr", # West Europe
    "emea-gb-db3-azr", # North Europe
    "us-va-ash-azr",   # East US
    "us-ca-sjc-azr",   # West US
    "apac-sg-sin-azr", # Southeast Asia
  ]
}

variable "availability_failed_locations_threshold" {
  description = "The alert fires when this many locations fail at the same time."
  type        = number
  default     = 2
}

variable "alert_email" {
  description = "E-mail address for alerts. null = no action group and no alert rule."
  type        = string
  default     = null
}

variable "budget_amount" {
  description = "Monthly budget for the resource group in the billing currency. null = no budget."
  type        = number
  default     = null
}

variable "budget_contact_emails" {
  description = "Extra e-mail addresses for budget notifications. Resource group owners are always notified."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags for all resources."
  type        = map(string)
  default     = {}
}
