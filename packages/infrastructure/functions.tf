# Lambda functions and their triggers, all in one file.
# Order: api, renderer, image-resizer (each with its trigger directly beneath),
# then the shared API Gateway covering `api` + `renderer` routes.

locals {
  # AWS Lambda Web Adapter (arm64) — release notes:
  # https://github.com/aws/aws-lambda-web-adapter/releases
  # Attached as a layer to the api Lambda; the renderer copies the same adapter binary
  # in via its Dockerfile (see renderer/Dockerfile ARG LWA_VERSION).
  lwa_layer_version = 27
  lwa_layer_arn     = "arn:aws:lambda:${var.region}:753240598075:layer:LambdaAdapterLayerArm64:${local.lwa_layer_version}"
}

# ----- api Lambda (zip + LWA layer) -----

module "api" {
  source        = "github.com/Maev4l/terraform-modules//modules/lambda-function?ref=v1.7.1"
  function_name = "visual-resumes-api"

  # LWA's extension intercepts the Lambda runtime API and forwards events as HTTP
  # requests to PORT — the Hono app listens there via @hono/node-server.
  layers = [local.lwa_layer_arn]

  zip = {
    filename = "${path.module}/../functions/api/dist/api.zip"
    runtime  = "nodejs24.x"
    # AWS_LAMBDA_EXEC_WRAPPER redirects managed-runtime startup to LWA's /opt/bootstrap,
    # which then execs this handler value as a shell command. run.sh just `exec node index.js`.
    handler = "run.sh"
    # Hash the bundled output, NOT the zip — zip metadata (entry timestamps) isn't stable across rebuilds.
    hash = filebase64sha256("${path.module}/../functions/api/bin/index.js")
  }

  architecture          = "arm64"
  memory_size           = 256
  timeout               = 10
  log_retention_in_days = var.log_retention_in_days

  environment_variables = {
    RESUMES_STORAGE_BUCKET   = local.bucket_storage
    RESUMES_PUBLISHED_BUCKET = local.bucket_published
    CLOUDFRONT_DIST_ID       = aws_cloudfront_distribution.app.id

    AWS_LAMBDA_EXEC_WRAPPER = "/opt/bootstrap"
    PORT                    = "8080"
    AWS_LWA_INVOKE_MODE     = "buffered"
  }

  additional_policy_arns = [aws_iam_policy.api.arn]
}

# ----- renderer Lambda (container) -----

# Resolve the :latest (or var.image_tag) tag to a digest-based URI. Lambda caches the
# digest at update time — referencing the tag alone wouldn't diff on a new push, so new
# images wouldn't roll out. The data source refetches every plan; when the digest changes
# Terraform detects the diff and updates the function.
data "aws_ecr_image" "renderer" {
  repository_name = aws_ecr_repository.renderer.name
  image_tag       = var.image_tag
}

module "renderer" {
  source        = "github.com/Maev4l/terraform-modules//modules/lambda-function?ref=v1.7.1"
  function_name = "visual-resumes-renderer"

  image = {
    uri = "${aws_ecr_repository.renderer.repository_url}@${data.aws_ecr_image.renderer.image_digest}"
  }

  architecture          = "arm64"
  memory_size           = 2048
  timeout               = 60
  log_retention_in_days = var.log_retention_in_days

  environment_variables = {
    RESUMES_STORAGE_BUCKET   = local.bucket_storage
    RESUMES_PUBLISHED_BUCKET = local.bucket_published
    CLOUDFRONT_DIST_ID       = aws_cloudfront_distribution.app.id

    # LWA binary is copied into /opt/extensions/ by the Dockerfile; it forwards events
    # as HTTP requests to PORT, where the Hono app listens via @hono/node-server.
    PORT                = "8080"
    AWS_LWA_INVOKE_MODE = "buffered"
  }

  additional_policy_arns = [aws_iam_policy.renderer.arn]
}

# ----- image-resizer Lambda (container) + S3 trigger -----
# Triggered on writes to photo-uploads/<customId>/<resumeId>. Produces a 600px WebP at
# users/<customId>/photos/<resumeId>.webp. No recursion risk (trigger prefix and output
# prefix don't overlap); no source cleanup (the bucket lifecycle rule reaps photo-uploads
# after 1 day).

data "aws_ecr_image" "image_resizer" {
  repository_name = aws_ecr_repository.image_resizer.name
  image_tag       = var.image_tag
}

module "image_resizer" {
  source        = "github.com/Maev4l/terraform-modules//modules/lambda-function?ref=v1.7.1"
  function_name = "visual-resumes-image-resizer"

  image = {
    uri = "${aws_ecr_repository.image_resizer.repository_url}@${data.aws_ecr_image.image_resizer.image_digest}"
  }

  architecture          = "arm64"
  memory_size           = 1024
  timeout               = 30
  log_retention_in_days = var.log_retention_in_days

  # No env vars: the S3 event payload carries bucket + key, and the handler reads both from the event.
  additional_policy_arns = [aws_iam_policy.image_resizer.arn]
}

module "image_resizer_s3_trigger" {
  source = "github.com/Maev4l/terraform-modules//modules/lambda-trigger-s3?ref=v1.7.1"

  function_name = module.image_resizer.function_name
  function_arn  = module.image_resizer.function_arn

  bucket_id  = aws_s3_bucket.storage.id
  bucket_arn = aws_s3_bucket.storage.arn

  events = ["s3:ObjectCreated:*"]

  # Raw uploads land under photo-uploads/<customId>/<resumeId> (no extension — browser sets content-type).
  filters = [
    { prefix = "photo-uploads/" },
  ]
}

# ----- API Gateway trigger (covers api + renderer route sets) -----

module "apigw" {
  source   = "github.com/Maev4l/terraform-modules//modules/lambda-trigger-apigw?ref=v1.7.1"
  api_name = "visual-resumes"

  # Fronted by CloudFront via the execute-api endpoint — must leave it enabled.
  disable_execute_api_endpoint = false

  # Same-origin through CloudFront, no CORS needed.
  cors = false

  authorizer = {
    name     = "visual-resumes-cognito-authorizer"
    issuer   = local.cognito_issuer
    audience = [local.cognito_client_id]
  }

  integrations = {
    api = {
      function_name = module.api.function_name
      function_arn  = module.api.function_arn
      invoke_arn    = module.api.invoke_arn
      routes = [
        "GET /api/resumes",
        "POST /api/resumes",
        "GET /api/resumes/{id}",
        "PUT /api/resumes/{id}",
        "DELETE /api/resumes/{id}",
        "POST /api/resumes/{id}/photo",
        "POST /api/resumes/{id}/revoke",
      ]
    }
    renderer = {
      function_name = module.renderer.function_name
      function_arn  = module.renderer.function_arn
      invoke_arn    = module.renderer.invoke_arn
      routes        = ["POST /api/resumes/{id}/publish"]
    }
  }
}
