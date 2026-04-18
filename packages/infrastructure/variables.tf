variable "region" {
  description = "Primary AWS region."
  type        = string
  default     = "eu-central-1"
}

variable "domain_name" {
  description = "Public domain for the app."
  type        = string
  default     = "visual-resumes.isnan.eu"
}

variable "hosted_zone_name" {
  description = "Route53 hosted zone name."
  type        = string
  default     = "isnan.eu"
}

variable "cognito_hosted_ui_origin" {
  description = "Cognito Hosted UI origin (scheme + host). Shared platform-idp custom domain."
  type        = string
  default     = "https://platform-idp-auth.isnan.eu"
}

variable "image_tag" {
  description = "Container image tag to deploy for renderer and image-resizer. Bootstrap uses 'latest'; the deploy pipeline overrides to a git SHA."
  type        = string
  default     = "latest"
}

variable "log_retention_in_days" {
  description = "CloudWatch log retention for Lambdas."
  type        = number
  default     = 7
}
