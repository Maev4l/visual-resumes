resource "aws_cloudfront_origin_access_control" "editor" {
  name                              = "visual-resumes-editor-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# WHY: S3 + OAC returns 403 (not 404) for missing keys, so SPA deep-links like
# /preview/<id> or /edit/<id> on first load surfaced as raw S3 AccessDenied XML.
# Rewriting at the edge — before S3 sees the request — is the canonical fix and
# leaves /api/* and /resumes/* (their own behaviors) untouched.
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "visual-resumes-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite SPA deep-links to /index.html (S3+OAC 403 workaround)"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var req = event.request;
      var uri = req.uri;
      // Heuristic: real files have a dot in the last path segment
      // (/assets/foo.js, /favicon.svg). Everything else is a SPA route.
      var last = uri.substring(uri.lastIndexOf('/') + 1);
      if (last === '' || last.indexOf('.') === -1) {
        req.uri = '/index.html';
      }
      return req;
    }
  EOT
}

resource "aws_cloudfront_origin_access_control" "published" {
  name                              = "visual-resumes-published-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

locals {
  api_gw_host = replace(module.apigw.api_endpoint, "https://", "")
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "visual-resumes"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [var.domain_name]

  # S3 editor (default behavior)
  origin {
    domain_name              = aws_s3_bucket.editor.bucket_regional_domain_name
    origin_id                = "s3-editor"
    origin_access_control_id = aws_cloudfront_origin_access_control.editor.id
  }

  # S3 published (/resumes/* behavior)
  origin {
    domain_name              = aws_s3_bucket.published.bucket_regional_domain_name
    origin_id                = "s3-published"
    origin_access_control_id = aws_cloudfront_origin_access_control.published.id
  }

  # API Gateway
  origin {
    domain_name = local.api_gw_host
    origin_id   = "api-gateway"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Default behavior: editor SPA
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-editor"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    # Attached only here so /api/* and /resumes/* behaviors stay untouched.
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # /resumes/* → S3 published prefix (long cache)
  ordered_cache_behavior {
    path_pattern           = "/resumes/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-published"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # /api/* → API Gateway, no caching, forward Authorization via managed policy
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "api-gateway"
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  # SPA fallback — 404 only. Do NOT add 403: it would mask API Gateway auth errors.
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = data.aws_acm_certificate.wildcard_isnan.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_s3_bucket_policy" "editor_oac" {
  bucket = aws_s3_bucket.editor.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${local.bucket_editor_arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.app.arn }
      }
    }]
  })
}

resource "aws_s3_bucket_policy" "published_oac" {
  bucket = aws_s3_bucket.published.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${local.bucket_published_arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.app.arn }
      }
    }]
  })
}
