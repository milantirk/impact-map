# Azure Front Door: global edge, TLS, caching and WAF in front of the App Service.
#
# Routing:
#   /api/*, /healthz, /readyz  -> origin, never cached at the edge
#   /*                         -> origin, cached; Front Door honours the origin
#                                 Cache-Control headers (immutable /assets/*,
#                                 no-cache index.html)

locals {
  is_premium = var.sku_name == "Premium_AzureFrontDoor"

  # WAF policy names allow letters and digits only.
  waf_policy_name = replace("waf${var.name_prefix}", "/[^a-zA-Z0-9]/", "")

  # Managed rule sets are a Premium feature.
  managed_rule_sets = local.is_premium ? {
    default = {
      type    = "Microsoft_DefaultRuleSet"
      version = "2.1"
      action  = "Block" # anomaly score >= 5 blocks the request
    }
    bots = {
      type    = "Microsoft_BotManagerRuleSet"
      version = "1.1"
      # Bot rules keep their own actions (bad bots: Block, good bots: Allow,
      # unknown bots: Log). This set-level action is only the fallback.
      action = "Log"
    }
  } : {}

  compress_content_types = [
    "application/javascript",
    "application/json",
    "application/xml",
    "application/vnd.ms-fontobject",
    "font/otf",
    "font/ttf",
    "image/svg+xml",
    "text/css",
    "text/html",
    "text/javascript",
    "text/plain",
    "text/xml",
  ]

  custom_domain_ids = azurerm_cdn_frontdoor_custom_domain.this[*].id

  diagnostic_log_categories = concat(
    ["FrontDoorAccessLog", "FrontDoorWebApplicationFirewallLog"],
    var.health_probe_enabled ? ["FrontDoorHealthProbeLog"] : [],
  )
}

resource "azurerm_cdn_frontdoor_profile" "this" {
  name                     = "afd-${var.name_prefix}"
  resource_group_name      = var.resource_group_name
  sku_name                 = var.sku_name
  response_timeout_seconds = 60
  tags                     = var.tags
}

resource "azurerm_cdn_frontdoor_endpoint" "this" {
  name                     = "fde-${var.name_prefix}-${var.name_suffix}"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  enabled                  = true
  tags                     = var.tags
}

resource "azurerm_cdn_frontdoor_origin_group" "app" {
  name                     = "og-app"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  session_affinity_enabled = false

  load_balancing {
    sample_size                        = 4
    successful_samples_required        = 3
    additional_latency_in_milliseconds = 50
  }

  dynamic "health_probe" {
    for_each = var.health_probe_enabled ? [1] : []
    content {
      protocol            = "Https"
      interval_in_seconds = 100
      request_type        = "GET"
      path                = "/healthz"
    }
  }
}

resource "azurerm_cdn_frontdoor_origin" "app" {
  name                           = "origin-app-service"
  cdn_frontdoor_origin_group_id  = azurerm_cdn_frontdoor_origin_group.app.id
  enabled                        = true
  host_name                      = var.origin_host_name
  origin_host_header             = var.origin_host_name
  http_port                      = 80
  https_port                     = 443
  priority                       = 1
  weight                         = 1000
  certificate_name_check_enabled = true
}

resource "azurerm_cdn_frontdoor_custom_domain" "this" {
  count = var.custom_domain == null ? 0 : 1

  name                     = replace(var.custom_domain, ".", "-")
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  host_name                = var.custom_domain

  tls {
    certificate_type = "ManagedCertificate"
    minimum_version  = "TLS12"

    cipher_suite {
      type = "TLS12_2023"
    }
  }
}

resource "azurerm_cdn_frontdoor_route" "api" {
  name                            = "route-api"
  cdn_frontdoor_endpoint_id       = azurerm_cdn_frontdoor_endpoint.this.id
  cdn_frontdoor_origin_group_id   = azurerm_cdn_frontdoor_origin_group.app.id
  cdn_frontdoor_origin_ids        = [azurerm_cdn_frontdoor_origin.app.id]
  cdn_frontdoor_custom_domain_ids = local.custom_domain_ids
  patterns_to_match               = ["/api/*", "/healthz", "/readyz"]
  supported_protocols             = ["Http", "Https"]
  https_redirect_enabled          = true
  forwarding_protocol             = "HttpsOnly"
  link_to_default_domain          = true
  # No cache block: these responses are never cached at the edge.
}

resource "azurerm_cdn_frontdoor_route" "site" {
  name                            = "route-site"
  cdn_frontdoor_endpoint_id       = azurerm_cdn_frontdoor_endpoint.this.id
  cdn_frontdoor_origin_group_id   = azurerm_cdn_frontdoor_origin_group.app.id
  cdn_frontdoor_origin_ids        = [azurerm_cdn_frontdoor_origin.app.id]
  cdn_frontdoor_custom_domain_ids = local.custom_domain_ids
  patterns_to_match               = ["/*"]
  supported_protocols             = ["Http", "Https"]
  https_redirect_enabled          = true
  forwarding_protocol             = "HttpsOnly"
  link_to_default_domain          = true

  # Caching is on and no rule overrides it, so Front Door follows the origin's
  # Cache-Control headers.
  cache {
    query_string_caching_behavior = "UseQueryString"
    compression_enabled           = true
    content_types_to_compress     = local.compress_content_types
  }
}

resource "azurerm_cdn_frontdoor_custom_domain_association" "this" {
  count = var.custom_domain == null ? 0 : 1

  cdn_frontdoor_custom_domain_id = azurerm_cdn_frontdoor_custom_domain.this[0].id
  cdn_frontdoor_route_ids = [
    azurerm_cdn_frontdoor_route.api.id,
    azurerm_cdn_frontdoor_route.site.id,
  ]
}

resource "azurerm_cdn_frontdoor_firewall_policy" "this" {
  name                       = local.waf_policy_name
  resource_group_name        = var.resource_group_name
  sku_name                   = var.sku_name
  enabled                    = true
  mode                       = var.waf_mode
  request_body_check_enabled = true

  custom_rule {
    name                           = "RateLimitApi"
    enabled                        = true
    priority                       = 100
    type                           = "RateLimitRule"
    action                         = "Block"
    rate_limit_duration_in_minutes = 1
    rate_limit_threshold           = var.api_rate_limit_per_minute

    match_condition {
      match_variable = "RequestUri"
      operator       = "Contains"
      match_values   = ["/api/"]
      transforms     = ["Lowercase"]
    }
  }

  dynamic "managed_rule" {
    for_each = local.managed_rule_sets
    content {
      type    = managed_rule.value.type
      version = managed_rule.value.version
      action  = managed_rule.value.action
    }
  }

  tags = var.tags
}

resource "azurerm_cdn_frontdoor_security_policy" "this" {
  name                     = "secpol-${var.name_prefix}"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id

  security_policies {
    firewall {
      cdn_frontdoor_firewall_policy_id = azurerm_cdn_frontdoor_firewall_policy.this.id

      association {
        patterns_to_match = ["/*"]

        domain {
          cdn_frontdoor_domain_id = azurerm_cdn_frontdoor_endpoint.this.id
        }

        dynamic "domain" {
          for_each = local.custom_domain_ids
          content {
            cdn_frontdoor_domain_id = domain.value
          }
        }
      }
    }
  }
}

module "diagnostics" {
  source = "../diagnostic_setting"

  target_resource_id         = azurerm_cdn_frontdoor_profile.this.id
  log_analytics_workspace_id = var.log_analytics_workspace_id
  log_categories             = local.diagnostic_log_categories
}
