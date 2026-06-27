output "site_url" {
  value = "https://${var.domain_name}"
}

output "region" {
  value = var.region
}

output "editor_bucket" {
  description = "Editor SPA bucket (Vite build output). CloudFront-fronted via OAC; default behavior."
  value       = local.bucket_editor
}

output "storage_bucket" {
  description = "App-internal storage (resume JSON + photo originals + thumbnails). IAM-only."
  value       = local.bucket_storage
}

output "published_bucket" {
  description = "Rendered resume artifacts. CloudFront-fronted via OAC; /resumes/* behavior."
  value       = local.bucket_published
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "ecr_renderer_repo_url" {
  value = aws_ecr_repository.renderer.repository_url
}

output "ecr_image_resizer_repo_url" {
  value = aws_ecr_repository.image_resizer.repository_url
}

output "cognito_user_pool_id" {
  value = local.cognito_user_pool_id
}

output "cognito_client_id" {
  value     = local.cognito_client_id
  sensitive = true
}

output "api_endpoint" {
  description = "API Gateway execute-api endpoint (editor hits /api/* via CloudFront, not this)."
  value       = module.apigw.api_endpoint
}

# Consumed by packages/editor/scripts/deploy.sh (Plan 6) → written as /config.json on the editor bucket.
output "editor_runtime_config" {
  description = "JSON blob written to s3://<editor-bucket>/config.json at editor deploy time."
  value = jsonencode({
    region                = var.region
    apiBaseUrl            = "https://${var.domain_name}/api"
    publicHost            = var.domain_name
    cognitoUserPoolId     = local.cognito_user_pool_id
    cognitoClientId       = local.cognito_client_id
    cognitoHostedUiOrigin = var.cognito_hosted_ui_origin
    cognitoRedirectUri    = "https://${var.domain_name}/"
    cognitoLogoutUri      = "https://${var.domain_name}/"
    cognitoScopes         = ["openid", "email", "profile"]
  })
  sensitive = true
}

output "cloudfront_logs_bucket" {
  description = "CloudFront access logs (Parquet, 90-day retention). Standard logging v2 → raw/app/year=.../month=.../day=.../."
  value       = local.bucket_logs
}
