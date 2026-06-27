# CloudFront Access-Log Historization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver every request to the visual-resumes CloudFront distribution as Parquet access logs into a dedicated, 90-day-retention S3 bucket — observe-only, no application changes.

**Architecture:** Standard CloudFront logging v2 via the CloudWatch Logs Delivery API (source → destination → delivery), all three delivery resources created in `us-east-1` (CloudFront requirement), writing Hive-partitioned Parquet to a new eu-central-1 bucket under `raw/app/year=YYYY/month=MM/day=DD/`. The bucket and its delivery-service write policy live in `s3.tf`; the delivery wiring lives in a new `logs.tf`.

**Tech Stack:** Terraform (`hashicorp/aws ~> 6.0`, `required_version >= 1.10.0`), AWS S3, CloudWatch Logs Delivery (standard logging v2), CloudFront.

## Global Constraints

- Scope is `packages/infrastructure` only — no Lambda/editor/frontend changes.
- Region: `eu-central-1` (default provider); the three delivery resources MUST use `provider = aws.us_east_1` (alias already in `main.tf`).
- Bucket name: `visual-resumes-cloudfront-logs-${local.account_id}` (`local.account_id` from `main.tf`).
- All S3 buckets: `force_destroy = true`.
- S3 prefix: `raw/app` (the `app` segment namespaces this single distribution).
- Hive partitioning: `suffix_path = "{yyyy}/{MM}/{dd}"` + `enable_hive_compatible_path = true`.
- Retention: lifecycle `expiration { days = 90 }`.
- Encryption: `AES256` (SSE-S3) — NOT KMS.
- Record fields: the exact 14-field set (case- and parenthesis-sensitive) — see Task 2.
- Bucket policy principal: `delivery.logs.amazonaws.com` with `aws:SourceAccount` + `aws:SourceArn` + `s3:x-amz-acl` conditions; missing/wrong conditions = silent `AccessDenied`.
- `terraform apply` is the operator's decision (creates real resources, costs money) — this plan stops at a clean `plan`. Never auto-apply.
- Commits are the operator's action per the repo's git policy; commit steps below describe intended commit boundaries.

---

### Task 1: S3 log bucket + supporting resources + delivery-write policy

Adds the destination bucket and everything that governs it. Ends with a bucket that `terraform validate` accepts and whose policy is shaped for the v2 delivery service. No delivery wiring yet (that is Task 2), so this task is independently reviewable: a reviewer can confirm the bucket, encryption, lifecycle, and the exact policy conditions in isolation.

**Files:**
- Modify: `packages/infrastructure/s3.tf` (add `bucket_logs` local + arn to the existing `locals` block; append the bucket + 4 supporting resources)

**Interfaces:**
- Consumes: `local.account_id` (declared in `main.tf`), `data.aws_caller_identity.current.account_id` (declared in `main.tf`).
- Produces:
  - `aws_s3_bucket.cloudfront_logs` (`.arn`, `.id`)
  - `aws_s3_bucket_policy.cloudfront_logs`
  - `local.bucket_logs` (string name), `local.bucket_logs_arn`

- [ ] **Step 1: Add the name locals**

In the existing `locals` block at the top of `packages/infrastructure/s3.tf`, add the log bucket name and its precomputed ARN alongside the other three:

```hcl
locals {
  bucket_editor    = "visual-resumes-editor"
  bucket_storage   = "visual-resumes-storage"
  bucket_published = "visual-resumes-published"
  # Account-id suffix per the global S3-naming rule (the other buckets predate it).
  # Dedicated per-app log bucket → clean blast-radius isolation; S3 has no per-bucket fee.
  bucket_logs = "visual-resumes-cloudfront-logs-${local.account_id}"

  bucket_editor_arn    = "arn:aws:s3:::${local.bucket_editor}"
  bucket_storage_arn   = "arn:aws:s3:::${local.bucket_storage}"
  bucket_published_arn = "arn:aws:s3:::${local.bucket_published}"
  bucket_logs_arn      = "arn:aws:s3:::${local.bucket_logs}"
}
```

- [ ] **Step 2: Append the bucket + public-access block + encryption**

Append to `packages/infrastructure/s3.tf`:

```hcl
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
```

- [ ] **Step 3: Append the lifecycle rule**

```hcl
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
```

- [ ] **Step 4: Append the delivery-service write policy**

```hcl
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
```

- [ ] **Step 5: Format and validate**

Run: `terraform -chdir=packages/infrastructure fmt && terraform -chdir=packages/infrastructure validate`
Expected: `fmt` prints no files (or only the touched file once) and reformats cleanly; `validate` prints `Success! The configuration is valid.`

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/s3.tf
git commit -m "feat: add CloudFront access-log S3 bucket"
```

---

### Task 2: Log delivery wiring (logs.tf)

Adds the three v2 delivery resources that connect the distribution to the bucket. Depends on Task 1's bucket + policy. Ends with a complete, `validate`-clean config.

**Files:**
- Create: `packages/infrastructure/logs.tf`

**Interfaces:**
- Consumes: `aws_cloudfront_distribution.app.arn` (from `cloudfront.tf`), `aws_s3_bucket.cloudfront_logs.arn` + `aws_s3_bucket_policy.cloudfront_logs` (from Task 1), `provider = aws.us_east_1` (from `main.tf`).
- Produces: `aws_cloudwatch_log_delivery_source.cloudfront`, `aws_cloudwatch_log_delivery_destination.cloudfront_s3`, `aws_cloudwatch_log_delivery.cloudfront`.

- [ ] **Step 1: Create logs.tf with the delivery source**

Create `packages/infrastructure/logs.tf`:

```hcl
# CloudFront standard logging v2 wiring; the destination bucket lives in s3.tf.
# See docs/superpowers/specs/2026-06-27-cloudfront-access-log-historization-design.md.
#
# NAMING: these are aws_cloudwatch_log_delivery_* even though the source is CloudFront and
# the destination is S3 (nothing is stored in CloudWatch). "Log delivery" is a generic
# CloudWatch Logs subsystem; CloudFront docs call this same feature "standard logging v2".
# Logs land as Parquet in S3, not in CloudWatch.

# Registers the CloudFront distribution as a log delivery source.
# MUST be created in us-east-1 (CloudFront delivery API requirement).
resource "aws_cloudwatch_log_delivery_source" "cloudfront" {
  provider     = aws.us_east_1
  name         = "visual-resumes-cloudfront-access-logs"
  log_type     = "ACCESS_LOGS"
  resource_arn = aws_cloudfront_distribution.app.arn
}
```

- [ ] **Step 2: Add the delivery destination**

Append to `packages/infrastructure/logs.tf`:

```hcl
# Where logs go + their on-disk format. Parquet output (confirmed allowed for S3).
# The "/raw/app" suffix on the destination ARN makes logs land under raw/app/ AND
# suppresses CloudFront's default AWSLogs/aws-account-id=<id>/CloudFront/ path. The app
# segment namespaces this distribution so other sources can use sibling prefixes later.
# MUST be created in us-east-1. output_format is creation-only; changing the destination
# ARN requires deleting the referencing delivery first (AWS rejects in-place updates while
# a delivery references it), so Terraform must destroy the pipe, update, then recreate it.
resource "aws_cloudwatch_log_delivery_destination" "cloudfront_s3" {
  provider                  = aws.us_east_1
  name                      = "visual-resumes-cloudfront-s3"
  delivery_destination_type = "S3"
  output_format             = "parquet"

  delivery_destination_configuration {
    destination_resource_arn = "${aws_s3_bucket.cloudfront_logs.arn}/raw/app"
  }
}
```

- [ ] **Step 3: Add the delivery (the pipe)**

Append to `packages/infrastructure/logs.tf`:

```hcl
# The pipe: links source → destination and selects fields.
# depends_on the bucket policy: CreateDelivery validates write access, so the policy
# must exist first or delivery creation fails.
resource "aws_cloudwatch_log_delivery" "cloudfront" {
  provider                 = aws.us_east_1
  delivery_source_name     = aws_cloudwatch_log_delivery_source.cloudfront.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.cloudfront_s3.arn

  # Field names are validated at apply time. date/time (no single "timestamp" field);
  # cs(Host)/cs(User-Agent) are parenthesized; the rest are hyphenated lowercase.
  # c-country + asn give per-row geo/network derived from the viewer IP (bot/scanner signal).
  record_fields = [
    "date",
    "time",
    "c-ip",
    "c-country",
    "asn",
    "cs-method",
    "cs-protocol",
    "cs(Host)",
    "cs-uri-stem",
    "cs-uri-query",
    "sc-status",
    "x-edge-result-type",
    "x-edge-location",
    "cs(User-Agent)",
  ]

  # Hive-style date partitioning UNDER raw/app => raw/app/year=YYYY/month=MM/day=DD/.
  # enable_hive_compatible_path MUST be true: only then does AWS allow the key=value layout,
  # and it auto-expands the bare {yyyy}/{MM}/{dd} placeholders into year=/month=/day=
  # (writing "year={yyyy}" literally is rejected with "Provided suffixPath is invalid"
  # while the flag is off).
  s3_delivery_configuration {
    suffix_path                 = "{yyyy}/{MM}/{dd}"
    enable_hive_compatible_path = true
  }

  depends_on = [aws_s3_bucket_policy.cloudfront_logs]
}
```

- [ ] **Step 4: Format and validate**

Run: `terraform -chdir=packages/infrastructure fmt && terraform -chdir=packages/infrastructure validate`
Expected: `validate` prints `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/logs.tf
git commit -m "feat: wire CloudFront standard logging v2 to S3"
```

---

### Task 3: Output + documentation

Surfaces the log bucket name as a Terraform output and documents the setup. Ends with a clean `plan` for operator review.

**Files:**
- Modify: `packages/infrastructure/outputs.tf` (append one output)
- Modify: `packages/infrastructure/README.md` (document the logging setup)

**Interfaces:**
- Consumes: `local.bucket_logs` (Task 1).
- Produces: `output.cloudfront_logs_bucket`.

- [ ] **Step 1: Add the output**

Append to `packages/infrastructure/outputs.tf`:

```hcl
output "cloudfront_logs_bucket" {
  description = "CloudFront access logs (Parquet, 90-day retention). Standard logging v2 → raw/app/year=.../month=.../day=.../."
  value       = local.bucket_logs
}
```

- [ ] **Step 2: Document the setup in README.md**

Add a section to `packages/infrastructure/README.md` describing: the dedicated log bucket, standard logging v2 delivering Parquet under `raw/app/` with Hive date partitioning, 90-day auto-expiry, the 14 record fields (incl. `c-ip`/`c-country`/`asn`), the us-east-1 delivery-resource requirement, and the silent-`AccessDenied` failure mode if the bucket-policy conditions are wrong. Explicitly note no query layer / Athena is built. Match the existing README's heading style and tone.

- [ ] **Step 3: Format and validate**

Run: `terraform -chdir=packages/infrastructure fmt && terraform -chdir=packages/infrastructure validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Review the plan**

Run: `terraform -chdir=packages/infrastructure plan`
Expected: a clean plan adding **5 resources in the default region** (bucket, public-access block, encryption config, lifecycle config, bucket policy) and **3 resources in us-east-1** (delivery source, destination, delivery), plus the new output. No changes to existing buckets, the distribution, or any Lambda/IAM resource.

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/outputs.tf packages/infrastructure/README.md
git commit -m "feat: output and document CloudFront log bucket"
```

---

## Operator verification (post-apply, not part of TDD loop)

These run after the operator decides to `terraform apply` (creates billable resources):

1. `terraform -chdir=packages/infrastructure apply` — confirm the 8 resources + output.
2. Generate a few requests against the visual-resumes domain.
3. Within ~15 min, confirm Parquet objects appear under
   `s3://visual-resumes-cloudfront-logs-<account-id>/raw/app/year=YYYY/month=MM/day=DD/`.
   If empty, the bucket-policy conditions/`Resource` are the first suspect (silent `AccessDenied`).
4. Spot-check one Parquet file contains a populated `c-ip` / `c-country` column.

## Self-Review notes

- **Spec coverage:** bucket+PAB+encryption+lifecycle+policy (Task 1), 3 delivery resources + 14 fields + Hive layout (Task 2), output + README doc (Task 3). All "Files touched" rows from the spec are covered.
- **Type/name consistency:** `aws_s3_bucket.cloudfront_logs`, `aws_s3_bucket_policy.cloudfront_logs`, `local.bucket_logs`/`local.bucket_logs_arn`, `aws_cloudwatch_log_delivery_source.cloudfront`, `aws_cloudwatch_log_delivery_destination.cloudfront_s3`, `aws_cloudwatch_log_delivery.cloudfront` used identically across tasks. Distribution referenced as `aws_cloudfront_distribution.app` (matches `cloudfront.tf`).
- **No placeholders:** all HCL shown in full; README content described by required topics (prose doc, not code).
