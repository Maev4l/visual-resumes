locals {
  bucket_editor    = "visual-resumes-editor"
  bucket_storage   = "visual-resumes-storage"
  bucket_published = "visual-resumes-published"

  # S3 bucket ARNs are deterministic from the name. Precompute so IAM / bucket-policy
  # documents can reference `local.bucket_*_arn` instead of the resource attribute —
  # keeps all bucket naming anchored to the three string locals above.
  bucket_editor_arn    = "arn:aws:s3:::${local.bucket_editor}"
  bucket_storage_arn   = "arn:aws:s3:::${local.bucket_storage}"
  bucket_published_arn = "arn:aws:s3:::${local.bucket_published}"
}

# ----- Editor bucket (Vite build output; CloudFront-fronted via OAC; default behavior) -----
resource "aws_s3_bucket" "editor" {
  bucket = local.bucket_editor
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
    allowed_origins = ["https://${var.domain_name}"]
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
}

resource "aws_s3_bucket_public_access_block" "published" {
  bucket                  = aws_s3_bucket.published.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
