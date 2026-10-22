variable "subscription_id" {
  description = "Target subscription. null uses ARM_SUBSCRIPTION_ID or the current Azure CLI subscription."
  type        = string
  default     = null
}

variable "location" {
  description = "Azure region for the shared resources and the environment resource groups."
  type        = string
  default     = "westeurope"
}

variable "project" {
  description = "Short project name used in resource names (lowercase letters and digits)."
  type        = string
  default     = "impactmap"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{2,11}$", var.project))
    error_message = "project must be 3-12 lowercase letters or digits and start with a letter."
  }
}

variable "github_owner" {
  description = "GitHub user or organization that owns the repository."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository name (without the owner)."
  type        = string
}

variable "environments" {
  description = "Application environments. Each gets a resource group and a GitHub deployment identity."
  type        = list(string)
  default     = ["dev", "prod"]

  validation {
    condition     = alltrue([for e in var.environments : can(regex("^[a-z][a-z0-9]{1,9}$", e)) && !contains(["plan", "shared"], e)])
    error_message = "Environment names must be 2-10 lowercase letters or digits and must not be 'plan' or 'shared'."
  }
}

variable "acr_sku" {
  description = "SKU of the shared container registry (Basic, Standard or Premium)."
  type        = string
  default     = "Basic"

  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.acr_sku)
    error_message = "acr_sku must be Basic, Standard or Premium."
  }
}

variable "tfstate_replication_type" {
  description = "Replication of the Terraform state storage account."
  type        = string
  default     = "GRS"
}

variable "tfstate_soft_delete_days" {
  description = "Soft-delete retention for state blobs and containers."
  type        = number
  default     = 30
}

variable "state_admin_principal_ids" {
  description = "Extra Entra object IDs (users or groups) that may read and write Terraform state. The caller of this stack is always added."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Extra tags for all resources."
  type        = map(string)
  default     = {}
}
