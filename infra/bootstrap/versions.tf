terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.10"
    }
  }

  # Starts with local state. To move the state into the storage account that
  # this stack creates, see backend.tf.example and infra/README.md.
}
