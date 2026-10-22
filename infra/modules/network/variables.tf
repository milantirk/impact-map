variable "name_prefix" {
  description = "Prefix used in resource names, for example impactmap-dev."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group for the network resources."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
}

variable "address_space" {
  description = "Address space of the virtual network."
  type        = list(string)
}

variable "app_subnet_prefix" {
  description = "CIDR of the subnet delegated to App Service VNet integration (/26 or larger)."
  type        = string
}

variable "db_subnet_prefix" {
  description = "CIDR of the subnet delegated to PostgreSQL Flexible Server."
  type        = string
}

variable "tags" {
  description = "Tags for all resources."
  type        = map(string)
  default     = {}
}
