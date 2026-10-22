config {
  # Lint the local modules that the stacks call, too.
  call_module_type = "local"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "azurerm" {
  enabled = true
  version = "0.32.0"
  source  = "github.com/terraform-linters/tflint-ruleset-azurerm"
}

# The App Service health check (health_check_path + eviction) already replaces
# unhealthy instances. Auto-heal recycles would mostly hide real failures.
rule "azurerm_app_service_missing_auto_heal_setting" {
  enabled = false
}
