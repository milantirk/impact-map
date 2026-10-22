output "profile_id" {
  description = "ID of the Front Door profile."
  value       = azurerm_cdn_frontdoor_profile.this.id
}

output "profile_name" {
  description = "Name of the Front Door profile."
  value       = azurerm_cdn_frontdoor_profile.this.name
}

output "profile_resource_guid" {
  description = "Front Door ID sent to the origin in the X-Azure-FDID header."
  value       = azurerm_cdn_frontdoor_profile.this.resource_guid
}

output "endpoint_host_name" {
  description = "Host name of the azurefd.net endpoint."
  value       = azurerm_cdn_frontdoor_endpoint.this.host_name
}

output "custom_domain_validation_token" {
  description = "Create a TXT record _dnsauth.<custom domain> with this value. null when no custom domain is set."
  value       = var.custom_domain == null ? null : azurerm_cdn_frontdoor_custom_domain.this[0].validation_token
}

output "custom_domain_cname_target" {
  description = "Point a CNAME record for the custom domain to this host name. null when no custom domain is set."
  value       = var.custom_domain == null ? null : azurerm_cdn_frontdoor_endpoint.this.host_name
}
