locals {
  bucket_editor    = "visual-resumes-editor"
  bucket_storage   = "visual-resumes-storage"
  bucket_published = "visual-resumes-published"
  # Account-id suffix per the global S3-naming rule (the other buckets predate it).
  # Dedicated per-app log bucket → clean blast-radius isolation; S3 has no per-bucket fee.
  bucket_logs = "visual-resumes-cloudfront-logs-${local.account_id}"

  # S3 bucket ARNs are deterministic from the name. Precompute so IAM / bucket-policy
  # documents can reference `local.bucket_*_arn` instead of the resource attribute —
  # keeps all bucket naming anchored to the three string locals above.
  bucket_editor_arn    = "arn:aws:s3:::${local.bucket_editor}"
  bucket_storage_arn   = "arn:aws:s3:::${local.bucket_storage}"
  bucket_published_arn = "arn:aws:s3:::${local.bucket_published}"
  bucket_logs_arn      = "arn:aws:s3:::${local.bucket_logs}"
}

# ----- Editor bucket (Vite build output; CloudFront-fronted via OAC; default behavior) -----
resource "aws_s3_bucket" "editor" {
  bucket = local.bucket_editor
  # Allow `terraform destroy` to remove the bucket even when objects remain.
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "editor" {
  bucket                  = aws_s3_bucket.editor.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ----- Storage bucket (IAM-only; everything the app needs to run) -----
resource "aws_s3_bucket" "storage" {
  bucket = local.bucket_storage
  # Allow `terraform destroy` to remove the bucket even when objects remain.
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "storage" {
  bucket                  = aws_s3_bucket.storage.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning on storage for free resume-JSON edit history.
resource "aws_s3_bucket_versioning" "storage" {
  bucket = aws_s3_bucket.storage.id
  versioning_configuration { status = "Enabled" }
}

# Allow the editor SPA to PUT photos directly via a presigned URL.
resource "aws_s3_bucket_cors_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  cors_rule {
    allowed_methods = ["PUT"]
    # Editor dev server runs at localhost:5178 (see packages/editor/vite.config.js — strict
    # port pinned to match the Cognito callback URL). Both prod + local dev are whitelisted.
    allowed_origins = ["https://${var.domain_name}", "http://localhost:5178"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 300
  }
}

# Raw photo uploads land under photo-uploads/<customId>/<resumeId>. The image-resizer Lambda
# processes them within seconds and deletes the source. This rule is a backstop — if
# image-resizer fails, S3 reaps stray uploads after 1 day so the bucket doesn't accumulate junk.
resource "aws_s3_bucket_lifecycle_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id

  rule {
    id     = "expire-photo-uploads"
    status = "Enabled"
    filter { prefix = "photo-uploads/" }
    expiration { days = 1 }
  }
}

# ----- Published bucket (rendered resume artifacts; CloudFront-fronted via OAC; /resumes/* behavior) -----
resource "aws_s3_bucket" "published" {
  bucket = local.bucket_published
  # Allow `terraform destroy` to remove the bucket even when objects remain.
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "published" {
  bucket                  = aws_s3_bucket.published.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ----- CloudFront access-log bucket (delivery-service-only writes; 90-day retention) -----
# Standard logging v2 delivers Parquet here. See logs.tf for the delivery wiring and
# docs/superpowers/specs/2026-06-27-cloudfront-access-log-historization-design.md.
resource "aws_s3_bucket" "cloudfront_logs" {
  bucket = local.bucket_logs
  # Allow `terraform destroy` to remove the bucket even when objects remain.
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "cloudfront_logs" {
  bucket                  = aws_s3_bucket.cloudfront_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# SSE-S3 (AES256), not KMS: v2 delivery to S3 supports SSE-S3 with no extra grants;
# SSE-KMS would require key-policy grants for delivery.logs.amazonaws.com (out of scope).
resource "aws_s3_bucket_server_side_encryption_configuration" "cloudfront_logs" {
  bucket = aws_s3_bucket.cloudfront_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Whole-bucket 90-day expiry: the bucket is dedicated to these logs (everything under
# raw/app/), so expiring everything is correct and simplest. Abort stale multipart
# uploads after 3 days so partial delivery writes don't accumulate storage.
resource "aws_s3_bucket_lifecycle_configuration" "cloudfront_logs" {
  bucket = aws_s3_bucket.cloudfront_logs.id

  rule {
    id     = "expire-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }
}

# Grant the CloudWatch Logs delivery service write access. WHY the conditions matter:
# if aws:SourceAccount / aws:SourceArn / s3:x-amz-acl are missing or wrong, or Resource
# doesn't cover where logs land, delivery SILENTLY fails with AccessDenied — no logs
# appear and nothing surfaces on the distribution. Whole-bucket Resource ("/*") sidesteps
# the prefix-mismatch trap AWS documents. SourceArn scopes to this account's us-east-1
# delivery sources.
resource "aws_s3_bucket_policy" "cloudfront_logs" {
  bucket = aws_s3_bucket.cloudfront_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AWSLogsDeliveryWrite"
      Effect    = "Allow"
      Principal = { Service = "delivery.logs.amazonaws.com" }
      Action    = "s3:PutObject"
      Resource  = "${local.bucket_logs_arn}/*"
      Condition = {
        StringEquals = {
          "s3:x-amz-acl"      = "bucket-owner-full-control"
          "aws:SourceAccount" = local.account_id
        }
        ArnLike = {
          "aws:SourceArn" = "arn:aws:logs:us-east-1:${local.account_id}:delivery-source:*"
        }
      }
    }]
  })
}
