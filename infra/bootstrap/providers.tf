provider "azurerm" {
  subscription_id = var.subscription_id

  # The state storage account has shared keys disabled: use Entra ID for blobs.
  storage_use_azuread = true

  # azurerm 5.x registers no resource providers by default. Bootstrap runs with
  # Owner rights, so it registers everything the stacks need once. The GitHub
  # identities have no subscription-level rights and cannot do this.
  resource_providers_to_register = [
    "Microsoft.AlertsManagement",
    "Microsoft.Cdn",
    "Microsoft.Consumption",
    "Microsoft.ContainerRegistry",
    "Microsoft.DBforPostgreSQL",
    "Microsoft.Insights",
    "Microsoft.ManagedIdentity",
    "Microsoft.Network",
    "Microsoft.OperationalInsights",
    "Microsoft.Storage",
    "Microsoft.Web",
  ]

  features {
    resource_group {
      prevent_deletion_if_contains_resources = true
    }

    storage {
      # Manage the storage account through Azure Resource Manager only. The
      # caller does not need blob data rights to create the account.
      data_plane_available = false
    }
  }
}
