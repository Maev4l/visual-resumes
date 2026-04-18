# ----- api Lambda policy -----
data "aws_iam_policy_document" "api" {
  statement {
    sid       = "StorageBucketUserPrefixCrud"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.bucket_storage_arn}/users/*"]
  }
  statement {
    sid       = "StorageBucketList"
    actions   = ["s3:ListBucket"]
    resources = [local.bucket_storage_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["users/*"]
    }
  }
  # Presigned PUT URL for photo upload + cleanup on resume delete.
  statement {
    sid       = "StorageBucketPhotoUploads"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.bucket_storage_arn}/photo-uploads/*"]
  }
  statement {
    sid       = "PublishedBucketDeleteForRevoke"
    actions   = ["s3:DeleteObject"]
    resources = ["${local.bucket_published_arn}/resumes/*"]
  }
  statement {
    sid       = "CloudFrontInvalidation"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.app.arn]
  }
}

resource "aws_iam_policy" "api" {
  name   = "visual-resumes-api"
  policy = data.aws_iam_policy_document.api.json
}

# ----- renderer Lambda policy -----
data "aws_iam_policy_document" "renderer" {
  statement {
    sid       = "StorageBucketRead"
    actions   = ["s3:GetObject"]
    resources = ["${local.bucket_storage_arn}/users/*"]
  }
  statement {
    sid       = "PublishedBucketWrite"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.bucket_published_arn}/resumes/*"]
  }
  statement {
    sid       = "CloudFrontInvalidation"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.app.arn]
  }
}

resource "aws_iam_policy" "renderer" {
  name   = "visual-resumes-renderer"
  policy = data.aws_iam_policy_document.renderer.json
}

# ----- image-resizer Lambda policy -----
data "aws_iam_policy_document" "image_resizer" {
  # Read the raw upload. No DeleteObject — the bucket lifecycle rule reaps uploads after 1 day.
  statement {
    sid       = "PhotoUploadsRead"
    actions   = ["s3:GetObject"]
    resources = ["${local.bucket_storage_arn}/photo-uploads/*"]
  }
  # Write the processed WebP to the user's durable photos folder.
  statement {
    sid       = "PhotosWrite"
    actions   = ["s3:PutObject"]
    resources = ["${local.bucket_storage_arn}/users/*/photos/*"]
  }
}

resource "aws_iam_policy" "image_resizer" {
  name   = "visual-resumes-image-resizer"
  policy = data.aws_iam_policy_document.image_resizer.json
}
