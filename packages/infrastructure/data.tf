# Route53 zone for apex alias + validation records if needed
data "aws_route53_zone" "root" {
  name         = var.hosted_zone_name
  private_zone = false
}

# Shared wildcard cert *.isnan.eu — already exists in us-east-1
data "aws_acm_certificate" "wildcard_isnan" {
  provider    = aws.us_east_1
  domain      = "*.isnan.eu"
  statuses    = ["ISSUED"]
  most_recent = true
}

# Shared Cognito pool (platform/idp)
data "aws_cognito_user_pools" "shared" {
  name = "platform-idp"
}

# App-client map maintained by platform/idp
data "aws_ssm_parameter" "app_clients" {
  name = "platform.idp.app-clients"
}

locals {
  cognito_user_pool_id = data.aws_cognito_user_pools.shared.ids[0]
  cognito_client_id    = jsondecode(data.aws_ssm_parameter.app_clients.value)["visual-resumes"]
  cognito_issuer       = "https://cognito-idp.${var.region}.amazonaws.com/${local.cognito_user_pool_id}"
}

# CloudFront AWS-managed policies (looked up by name, not hardcoded IDs)
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}
