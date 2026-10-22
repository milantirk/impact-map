# Partial backend configuration (Entra ID auth, no storage keys).
# Local runs:      terraform init -backend-config=backend.hcl   (see backend.hcl.example)
# GitHub Actions:  -backend-config flags in .github/workflows/infra.yml
terraform {
  backend "azurerm" {}
}
