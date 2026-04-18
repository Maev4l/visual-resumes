# Plan 1 — Infrastructure skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No commits.** Do NOT run `git add`, `git commit`, or `git push` at any point. Leave all changes staged/unstaged for the user to review and commit manually.

**Goal:** Provision the full AWS footprint for `visual-resumes.isnan.eu` (3 S3 buckets, single CloudFront distribution, API Gateway with JWT auth, 3 Lambda functions with hello-world stubs, ECR, IAM) plus the monorepo skeleton (root `package.json`, `.gitignore`, docs). At the end of this plan: the domain resolves, the SPA origin serves a placeholder `index.html`, all three Lambdas return a 200 from their stubs, and hitting `/api/*` without a token returns 401.

**Architecture:** One CloudFront distribution with path-routed behaviors (editor default, `/resumes/*`, `/api/*`) and a 404 → `/index.html` fallback for SPA routing. The `api` Lambda is zip-packaged; `renderer` and `image-resizer` are container images from ECR. API Gateway uses `terraform-modules/lambda-trigger-apigw` (post-Plan-0b rewrite). Cognito authorization reuses the shared `platform-idp` pool — the `resumes` app client is registered in `platform/idp` (Plan 0a) and discovered here via the established `platform.idp.app-clients` SSM map.

**Tech Stack:** Terraform `>= 1.10.0`, AWS provider `~> 6.0` (two aliases: `eu-central-1` default + `us-east-1` for CloudFront-related lookups), Node.js 22 stub Lambdas, Docker for ECR stubs, `terraform-modules` via GitHub source.

**Repo this plan runs in:** `visual-resumes`.

**Prerequisites:**
- **Plan 0a** applied in `platform/idp` — `aws_cognito_user_pool_client.visual_resumes`, `aws_cognito_user_group.visual_resumes` exist, and `"visual-resumes"` is a key in `platform.idp.app-clients`.
- **Plan 0b** applied and `terraform-modules` published at tag `v1.7.0` (both `lambda-function` and `lambda-trigger-apigw` modules are pulled from that tag).
- A wildcard cert `*.isnan.eu` already exists in `us-east-1` (shared, reused via data source).
- Route53 zone `isnan.eu` exists.

---

## Account-wide conventions

Every Terraform-managed project in this account follows these conventions; this plan adheres to them unless explicitly overridden:

- Region `eu-central-1`
- Backend S3 bucket `global-tf-states` with `use_lockfile = true` (no DynamoDB lock table)
- AWS provider `~> 6.0`, Terraform `>= 1.10.0`
- Default tags `{ application = "<app>", owner = "terraform" }`
- Wildcard ACM data source (`*.isnan.eu` in `us-east-1`)
- `data.aws_cognito_user_pools { name = "platform-idp" }` + `platform.idp.app-clients` SSM lookup for Cognito wiring
- CloudFront SPA fallback maps **404 only** (not 403 — 403 masks API Gateway auth errors)

---

## File structure (what this plan creates)

```
/
├── .gitignore
├── .nvmrc                                  # "22"
├── .editorconfig
├── package.json                            # root scripts
├── README.md                               # top-level project README
├── docs/superpowers/                       # specs + plans (already exist)
└── packages/
    ├── functions/                          # shared package.json + yarn.lock (added in Plan 3)
    │   ├── api/
    │   │   ├── src/index.js                # handler source (hello-world stub)
    │   │   ├── bin/                        # transpiled JS (gitignored)
    │   │   ├── dist/                       # api.zip (gitignored)
    │   │   └── scripts/build.sh            # src → bin → zip → dist/api.zip
    │   ├── renderer/
    │   │   ├── src/index.js
    │   │   ├── bin/                        # COPY'd into Docker image
    │   │   ├── Dockerfile
    │   │   └── scripts/{build.sh,push.sh}
    │   ├── image-resizer/
    │   │   ├── src/index.js
    │   │   ├── bin/
    │   │   ├── Dockerfile
    │   │   └── scripts/{build.sh,push.sh}
    │   └── scripts/bootstrap.sh            # orchestrator
    ├── editor/
    │   ├── index.html                      # placeholder (Plan 6 replaces)
    │   └── scripts/deploy-placeholder.sh
    └── infrastructure/
        ├── main.tf                         # provider + backend + required_providers
        ├── variables.tf
        ├── data.tf                         # Cognito pool, ACM wildcard, Route53 zone, app-clients SSM
        ├── s3.tf                           # 3 buckets (editor / storage / published)
        ├── ecr.tf                          # 2 repos
        ├── iam.tf                          # inline policies per Lambda
        ├── functions.tf                    # 3 × lambda-function + their triggers (S3 + API Gateway)
        ├── cloudfront.tf                   # distribution + OACs + bucket policies
        ├── route53.tf                      # apex A-alias → CloudFront
        ├── outputs.tf
        └── README.md
```

Strict three-role convention per function: `src/` = source, `bin/` = transpiled JS, `dist/` = packaged artifact (`.zip` only; unused for container), `scripts/` = `.sh`. No shared `src/`, `bin/`, or `dist/`.

---

### Task 1: Repo-root scaffolding

**Files:**
- Create: `.gitignore`, `.nvmrc`, `.editorconfig`, `package.json`, `README.md`

- [ ] **Step 1: Initialize git if not already**

Run: `git init && git branch -M main`
Expected: `.git/` appears.

- [ ] **Step 2: Create `.gitignore`**

```gitignore
# dependencies
node_modules/
.yarn/
.pnp.*

# builds
dist/
build/
.next/
.vite/
.cache/

# terraform
**/.terraform/
**/.terraform.lock.hcl
*.tfstate
*.tfstate.backup
*.tfplan
crash.log
crash.*.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# env
.env
.env.*
!.env.example

# macOS
.DS_Store

# IDE
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json

# logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

- [ ] **Step 3: Create `.nvmrc`**

```
22
```

- [ ] **Step 4: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.tf]
indent_size = 2
```

- [ ] **Step 5: Create root `package.json`**

```json
{
  "name": "visual-resumes",
  "version": "0.1.0",
  "private": true,
  "description": "Visual CV authoring app (visual-resumes.isnan.eu)",
  "scripts": {
    "frontend:dev": "yarn --cwd packages/editor dev",
    "frontend:build": "yarn --cwd packages/editor build",
    "frontend:deploy": "yarn frontend:build && yarn --cwd packages/editor deploy",
    "backend:build": "yarn --cwd packages/functions build",
    "backend:deploy": "yarn backend:build && yarn --cwd packages/functions push-renderer && yarn --cwd packages/functions push-image-resizer && yarn infra:apply",
    "infra:init": "terraform -chdir=packages/infrastructure init",
    "infra:plan": "terraform -chdir=packages/infrastructure plan",
    "infra:apply": "terraform -chdir=packages/infrastructure apply -auto-approve",
    "infra:output": "terraform -chdir=packages/infrastructure output",
    "lint": "yarn --cwd packages/editor lint && yarn --cwd packages/functions lint",
    "test": "yarn --cwd packages/editor test && yarn --cwd packages/functions test",
    "deploy": "yarn backend:deploy && yarn frontend:deploy"
  },
  "engines": {
    "node": "22"
  }
}
```

- [ ] **Step 6: Create root `README.md`**

```markdown
# visual-resumes

Authoring tool for visual CVs, served at `visual-resumes.isnan.eu`.

- Spec: `docs/superpowers/specs/2026-04-18-visual-cv-design.md`
- Plans: `docs/superpowers/plans/`

## Packages

- `packages/editor` — Vite + React SPA
- `packages/functions` — Lambda handlers (`api`, `renderer`, `image-resizer`)
- `packages/shared` — Handlebars renderer, schema, section types (imported via relative path)
- `packages/templates` — resume templates (static files)
- `packages/infrastructure` — Terraform

## Prerequisites

See `packages/infrastructure/README.md`.

## Development

- `yarn frontend:dev` — run editor against the deployed API
- `yarn infra:plan` — preview Terraform changes
- `yarn deploy` — full deploy (backend then frontend)
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore .nvmrc .editorconfig package.json README.md
git commit -m "chore: repo scaffolding"
```

---

### Task 2: Stub Lambda handlers (final folder layout)

> Each function folder already has its final layout (`src/`, `bin/`, `dist/`, `scripts/`). Plans 3/4/5 replace the stub source + build scripts with real code. Here, stubs populate `bin/` via a trivial `cp` rather than a real bundler.

**Files:**
- Create: `packages/functions/.gitignore`
- Create: `packages/functions/api/src/index.js`
- Create: `packages/functions/api/scripts/build.sh`
- Create: `packages/functions/renderer/src/index.js`
- Create: `packages/functions/renderer/Dockerfile`
- Create: `packages/functions/renderer/scripts/build.sh`
- Create: `packages/functions/renderer/scripts/push.sh`
- Create: `packages/functions/image-resizer/src/index.js`
- Create: `packages/functions/image-resizer/Dockerfile`
- Create: `packages/functions/image-resizer/scripts/build.sh`
- Create: `packages/functions/image-resizer/scripts/push.sh`
- Create: `packages/functions/scripts/bootstrap.sh`

- [ ] **Step 1: `packages/functions/.gitignore`**

```gitignore
*/bin/
*/dist/
node_modules/
```

- [ ] **Step 2: `packages/functions/api/src/index.js`**

```javascript
export const handler = async (event) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    stub: 'api',
    path: event?.rawPath ?? event?.requestContext?.http?.path ?? null,
  }),
});
```

- [ ] **Step 3: `packages/functions/api/scripts/build.sh`**

```bash
#!/usr/bin/env bash
# Stub build: copy src/ → bin/, zip bin/ → dist/api.zip.
# Plan 3 replaces the copy step with esbuild.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$DIR/bin" "$DIR/dist"
mkdir -p "$DIR/bin" "$DIR/dist"

cp "$DIR/src/index.js" "$DIR/bin/index.js"
cat > "$DIR/bin/package.json" <<'EOF'
{ "type": "module" }
EOF

( cd "$DIR/bin" && zip -q -r "$DIR/dist/api.zip" . )
echo "built $DIR/dist/api.zip"
```

- [ ] **Step 4: `packages/functions/renderer/src/index.js`**

```javascript
export const handler = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ stub: 'renderer' }),
});
```

- [ ] **Step 5: `packages/functions/renderer/Dockerfile`**

```dockerfile
FROM public.ecr.aws/lambda/nodejs:22
COPY bin/ ${LAMBDA_TASK_ROOT}/
CMD ["index.handler"]
```

- [ ] **Step 6: `packages/functions/renderer/scripts/build.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-latest}"

rm -rf "$DIR/bin"
mkdir -p "$DIR/bin"
cp "$DIR/src/index.js" "$DIR/bin/index.js"
cat > "$DIR/bin/package.json" <<'EOF'
{ "type": "module" }
EOF

# --provenance=false + --sbom=false: AWS Lambda only accepts Docker v2 schema 2 manifests.
# Modern buildx defaults to OCI + attestations, which Lambda rejects with
# "The image manifest, config or layer media type ... is not supported".
docker buildx build --platform linux/arm64 \
  --provenance=false --sbom=false \
  --load \
  -t "visual-resumes-renderer:$TAG" "$DIR"
echo "built image visual-resumes-renderer:$TAG"
```

- [ ] **Step 7: `packages/functions/renderer/scripts/push.sh`**

```bash
#!/usr/bin/env bash
# Usage: push.sh <account-id> <region> [tag]
set -euo pipefail

ACCOUNT_ID="${1:?usage: push.sh <account-id> <region> [tag]}"
REGION="${2:?usage: push.sh <account-id> <region> [tag]}"
TAG="${3:-latest}"

REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/visual-resumes-renderer"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

docker tag  "visual-resumes-renderer:$TAG" "$REPO:$TAG"
docker push "$REPO:$TAG"
echo "pushed $REPO:$TAG"
```

- [ ] **Step 8: `packages/functions/image-resizer/src/index.js`**

```javascript
export const handler = async (event) => {
  console.log('image-resizer stub received event', JSON.stringify(event));
  return { stub: 'image-resizer' };
};
```

- [ ] **Step 9: `packages/functions/image-resizer/Dockerfile`**

```dockerfile
FROM public.ecr.aws/lambda/nodejs:22
COPY bin/ ${LAMBDA_TASK_ROOT}/
CMD ["index.handler"]
```

- [ ] **Step 10: `packages/functions/image-resizer/scripts/build.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-latest}"

rm -rf "$DIR/bin"
mkdir -p "$DIR/bin"
cp "$DIR/src/index.js" "$DIR/bin/index.js"
cat > "$DIR/bin/package.json" <<'EOF'
{ "type": "module" }
EOF

# --provenance=false + --sbom=false: AWS Lambda only accepts Docker v2 schema 2 manifests.
# Modern buildx defaults to OCI + attestations, which Lambda rejects with
# "The image manifest, config or layer media type ... is not supported".
docker buildx build --platform linux/arm64 \
  --provenance=false --sbom=false \
  --load \
  -t "visual-resumes-image-resizer:$TAG" "$DIR"
echo "built image visual-resumes-image-resizer:$TAG"
```

- [ ] **Step 11: `packages/functions/image-resizer/scripts/push.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ACCOUNT_ID="${1:?usage: push.sh <account-id> <region> [tag]}"
REGION="${2:?usage: push.sh <account-id> <region> [tag]}"
TAG="${3:-latest}"

REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/visual-resumes-image-resizer"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

docker tag  "visual-resumes-image-resizer:$TAG" "$REPO:$TAG"
docker push "$REPO:$TAG"
echo "pushed $REPO:$TAG"
```

- [ ] **Step 12: `packages/functions/scripts/bootstrap.sh`**

```bash
#!/usr/bin/env bash
# One-shot: build all three functions and push the two container images.
# Usage: bootstrap.sh <account-id> <region> [tag]
set -euo pipefail

ACCOUNT_ID="${1:?usage: bootstrap.sh <account-id> <region> [tag]}"
REGION="${2:?usage: bootstrap.sh <account-id> <region> [tag]}"
TAG="${3:-latest}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"$ROOT/api/scripts/build.sh"

"$ROOT/renderer/scripts/build.sh"       "$TAG"
"$ROOT/renderer/scripts/push.sh"        "$ACCOUNT_ID" "$REGION" "$TAG"

"$ROOT/image-resizer/scripts/build.sh"  "$TAG"
"$ROOT/image-resizer/scripts/push.sh"   "$ACCOUNT_ID" "$REGION" "$TAG"

echo "bootstrap complete with tag $TAG"
```

- [ ] **Step 13: Make every script executable**

Run:

```bash
chmod +x packages/functions/api/scripts/build.sh \
         packages/functions/renderer/scripts/build.sh \
         packages/functions/renderer/scripts/push.sh \
         packages/functions/image-resizer/scripts/build.sh \
         packages/functions/image-resizer/scripts/push.sh \
         packages/functions/scripts/bootstrap.sh
```

- [ ] **Step 14: Smoke test the api zip locally**

Run: `packages/functions/api/scripts/build.sh`
Expected: `packages/functions/api/dist/api.zip` exists.

Run: `unzip -l packages/functions/api/dist/api.zip`
Expected: `index.js` + `package.json` listed.

- [ ] **Step 15: Commit**

```bash
git add packages/functions
git commit -m "feat(functions): per-function src/bin/dist/scripts layout with hello-world stubs"
```

---

### Task 3: Terraform — `main.tf` (providers + backend + required_providers)

**Files:**
- Create: `packages/infrastructure/main.tf`

- [ ] **Step 1: Write the file**

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "global-tf-states"
    key          = "visual-resumes/terraform.tfstate"
    region       = "eu-central-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      application = "visual-resumes"
      owner       = "terraform"
    }
  }
}

# CloudFront-related lookups (wildcard ACM cert) must use us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      application = "visual-resumes"
      owner       = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/main.tf
git commit -m "feat(infra): terraform providers + backend"
```

---

### Task 4: Terraform — `variables.tf`

**Files:**
- Create: `packages/infrastructure/variables.tf`

- [ ] **Step 1: Write the file**

```hcl
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/variables.tf
git commit -m "feat(infra): variables"
```

---

### Task 5: Terraform — `data.tf`

**Files:**
- Create: `packages/infrastructure/data.tf`

- [ ] **Step 1: Write the file**

```hcl
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/data.tf
git commit -m "feat(infra): data sources (ACM wildcard, Cognito pool + SSM app-clients, CF managed policies)"
```

---

### Task 6: Terraform — S3 buckets

**Files:**
- Create: `packages/infrastructure/s3.tf`

- [ ] **Step 1: Write the file**

```hcl
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
# processes them within seconds. This rule is a backstop — if image-resizer fails, S3 reaps
# stray uploads after 1 day so the bucket doesn't accumulate junk. (The resizer doesn't delete
# sources itself — no IAM grant, no code — the lifecycle handles it.)
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
```

---

### Task 7: Terraform — ECR repositories

**Files:**
- Create: `packages/infrastructure/ecr.tf`

- [ ] **Step 1: Write the file**

```hcl
resource "aws_ecr_repository" "renderer" {
  name                 = "visual-resumes-renderer"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_repository" "image_resizer" {
  name                 = "visual-resumes-image-resizer"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

locals {
  ecr_keep_last_10 = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 tagged images"
      selection = {
        tagStatus      = "tagged"
        tagPatternList = ["*"]
        countType      = "imageCountMoreThan"
        countNumber    = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "renderer" {
  repository = aws_ecr_repository.renderer.name
  policy     = local.ecr_keep_last_10
}

resource "aws_ecr_lifecycle_policy" "image_resizer" {
  repository = aws_ecr_repository.image_resizer.name
  policy     = local.ecr_keep_last_10
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/ecr.tf
git commit -m "feat(infra): ECR repos for renderer + image-resizer"
```

---

### Task 8: Terraform — IAM policies

> The `lambda-function` module creates its own role. We attach project-specific inline-style policies by ARN via `additional_policy_arns`. That requires creating `aws_iam_policy` resources (not inline role policies).

**Files:**
- Create: `packages/infrastructure/iam.tf`

- [ ] **Step 1: Write the file**

```hcl
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/iam.tf
git commit -m "feat(infra): IAM policies attached to each Lambda role"
```

---

### Task 9: Terraform — Lambda modules + their triggers

**Files:**
- Create: `packages/infrastructure/functions.tf`

> All modules are pulled from tag `v1.7.0` (post-Plan-0b republish). This single file contains every Lambda plus its triggers (S3 for image-resizer, API Gateway for api + renderer). Keeps wiring next to the code that wires it.

- [ ] **Step 1: Write the file**

```hcl
# Lambda functions and their triggers, all in one file.
# Order: api, renderer, image-resizer (each with its trigger directly beneath),
# then the shared API Gateway covering `api` + `renderer` routes.

# ----- api Lambda (zip) -----

module "api" {
  source        = "github.com/Maev4l/terraform-modules//modules/lambda-function?ref=v1.7.0"
  function_name = "visual-resumes-api"

  zip = {
    filename = "${path.module}/../functions/api/dist/api.zip"
    runtime  = "nodejs22.x"
    handler  = "index.handler"
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
  }

  additional_policy_arns = [aws_iam_policy.api.arn]
}

# ----- renderer Lambda (container) -----

module "renderer" {
  source        = "github.com/Maev4l/terraform-modules//modules/lambda-function?ref=v1.7.0"
  function_name = "visual-resumes-renderer"

  image = {
    uri = "${aws_ecr_repository.renderer.repository_url}:${var.image_tag}"
  }

  architecture          = "arm64"
  memory_size           = 2048
  timeout               = 60
  log_retention_in_days = var.log_retention_in_days

  environment_variables = {
    RESUMES_STORAGE_BUCKET   = local.bucket_storage
    RESUMES_PUBLISHED_BUCKET = local.bucket_published
    CLOUDFRONT_DIST_ID       = aws_cloudfront_distribution.app.id
  }

  additional_policy_arns = [aws_iam_policy.renderer.arn]
}

# ----- image-resizer Lambda (container) + S3 trigger -----
# Triggered on writes to photo-uploads/<customId>/<resumeId>. Produces a 600px WebP at
# users/<customId>/photos/<resumeId>.webp. No recursion risk (trigger prefix and output
# prefix don't overlap); no source cleanup (the bucket lifecycle rule reaps photo-uploads
# after 1 day — Plan 4 handler doesn't DeleteObject).

module "image_resizer" {
  source        = "github.com/Maev4l/terraform-modules//modules/lambda-function?ref=v1.7.0"
  function_name = "visual-resumes-image-resizer"

  image = {
    uri = "${aws_ecr_repository.image_resizer.repository_url}:${var.image_tag}"
  }

  architecture          = "arm64"
  memory_size           = 1024
  timeout               = 30
  log_retention_in_days = var.log_retention_in_days

  # No env vars: the S3 event payload carries bucket + key, and the handler reads both from the event.
  additional_policy_arns = [aws_iam_policy.image_resizer.arn]
}

module "image_resizer_s3_trigger" {
  source = "github.com/Maev4l/terraform-modules//modules/lambda-trigger-s3?ref=v1.7.0"

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
  source   = "github.com/Maev4l/terraform-modules//modules/lambda-trigger-apigw?ref=v1.7.0"
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
```

- [ ] **Step 2: `terraform fmt` + `validate` (with `init -backend=false` once)**

Module references won't resolve until `init`, so validation runs as part of Task 17.

---

### Task 11: Terraform — CloudFront distribution

**Files:**
- Create: `packages/infrastructure/cloudfront.tf`

- [ ] **Step 1: Write the file**

```hcl
resource "aws_cloudfront_origin_access_control" "editor" {
  name                              = "visual-resumes-editor-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/cloudfront.tf
git commit -m "feat(infra): CloudFront distribution + OAC policies"
```

---

### Task 12: Terraform — Route 53 apex record

**Files:**
- Create: `packages/infrastructure/route53.tf`

- [ ] **Step 1: Write the file**

```hcl
resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/route53.tf
git commit -m "feat(infra): Route53 apex A-alias to CloudFront"
```

---

### Task 14: Terraform — `outputs.tf`

**Files:**
- Create: `packages/infrastructure/outputs.tf`

- [ ] **Step 1: Write the file**

```hcl
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
    cognitoRedirectUri    = "https://${var.domain_name}/auth/callback"
    cognitoLogoutUri      = "https://${var.domain_name}/"
    cognitoScopes         = ["openid", "email", "profile"]
  })
  sensitive = true
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/outputs.tf
git commit -m "feat(infra): outputs (incl. editor_runtime_config)"
```

---

### Task 15: Infrastructure README

**Files:**
- Create: `packages/infrastructure/README.md`

- [ ] **Step 1: Write the README**

```markdown
# packages/infrastructure

Terraform for `visual-resumes.isnan.eu`.

## Conventions

Region `eu-central-1`, backend S3 bucket `global-tf-states` with `use_lockfile = true`, AWS provider `~> 6.0`. Reuses:
- Shared Cognito pool `platform-idp`
- `platform.idp.app-clients` SSM map (key `resumes` published by Plan 0a)
- Wildcard cert `*.isnan.eu` in `us-east-1`

## Prerequisites

1. **Plan 0a applied in `platform/idp`** — the `visual-resumes` client + group exist, `platform.idp.app-clients` contains `"visual-resumes": <client-id>`:
   ```bash
   aws ssm get-parameter --name platform.idp.app-clients --query 'Parameter.Value' --output text | jq '."visual-resumes"'
   ```
2. **Plan 0b applied** — `terraform-modules/lambda-trigger-apigw` rewritten and the repo republished as tag `v1.7.0`. All `?ref=` references in `functions.tf` already point at that tag.
3. **Stub container images in ECR** — see Bootstrap below.

## Bootstrap (first-time apply)

Lambda container functions require their ECR images to exist before `terraform apply`. Sequence:

```bash
terraform -chdir=packages/infrastructure init

# Create ONLY the ECR repos so we can push into them
terraform -chdir=packages/infrastructure apply \
  -target=aws_ecr_repository.renderer \
  -target=aws_ecr_repository.image_resizer \
  -auto-approve

# Build stub api.zip and push stub images
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo eu-central-1)
packages/functions/scripts/bootstrap.sh "$ACCOUNT_ID" "$REGION" latest

# Full apply
terraform -chdir=packages/infrastructure apply -auto-approve

# Deploy placeholder index.html
packages/editor/scripts/deploy-placeholder.sh
```

## Day-to-day

- `yarn infra:plan`
- `yarn infra:apply`
- `yarn infra:output`

## Variables

| Name | Default |
|---|---|
| `region` | `eu-central-1` |
| `domain_name` | `visual-resumes.isnan.eu` |
| `hosted_zone_name` | `isnan.eu` |
| `cognito_hosted_ui_origin` | `https://platform-idp-auth.isnan.eu` |
| `image_tag` | `latest` (deploy pipeline overrides to git SHA) |
| `log_retention_in_days` | `7` |
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/README.md
git commit -m "docs(infra): conventions + prerequisites + bootstrap"
```

---

### Task 16: Placeholder editor page

**Files:**
- Create: `packages/editor/index.html`
- Create: `packages/editor/scripts/deploy-placeholder.sh`

- [ ] **Step 1: `packages/editor/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
    <title>visual-resumes (placeholder)</title>
  </head>
  <body>
    <main style="font-family: system-ui; padding: 2rem;">
      <h1>visual-resumes</h1>
      <p>Editor SPA has not been deployed yet (Plan 6).</p>
    </main>
  </body>
</html>
```

- [ ] **Step 2: `packages/editor/scripts/deploy-placeholder.sh`**

```bash
#!/usr/bin/env bash
# Ships packages/editor/index.html to the editor bucket + invalidates CF.
# Plan 6 replaces this with a real Vite build + deploy.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$(cd "$DIR/../infrastructure" && pwd)"

BUCKET=$(terraform -chdir="$INFRA" output -raw editor_bucket)
DIST_ID=$(terraform -chdir="$INFRA" output -raw cloudfront_distribution_id)

aws s3 cp "$DIR/index.html" "s3://$BUCKET/index.html" --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html"
```

- [ ] **Step 3: Make executable + commit**

```bash
chmod +x packages/editor/scripts/deploy-placeholder.sh
git add packages/editor/index.html packages/editor/scripts/deploy-placeholder.sh
git commit -m "feat(editor): placeholder index.html + deploy script"
```

---

### Task 17: Validate formatting

**Files:** none.

- [ ] **Step 1: Format**

Run: `terraform -chdir=packages/infrastructure fmt`
Expected: no diffs, or all files cleaned.

- [ ] **Step 2: Init without backend (to check module references without hitting S3)**

Run: `terraform -chdir=packages/infrastructure init -backend=false`
Expected: module downloads OK.

- [ ] **Step 3: Validate**

Run: `terraform -chdir=packages/infrastructure validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit any formatting fixes**

```bash
git add -u packages/infrastructure/
git commit -m "chore(infra): terraform fmt" --allow-empty
```

---

### Task 18: First bootstrap + full apply

**Files:** none.

- [ ] **Step 1: Init with real backend**

Run: `terraform -chdir=packages/infrastructure init`
Expected: backend initialized against `global-tf-states`.

- [ ] **Step 2: Targeted ECR apply**

Run:

```bash
terraform -chdir=packages/infrastructure apply \
  -target=aws_ecr_repository.renderer \
  -target=aws_ecr_repository.image_resizer \
  -auto-approve
```

Expected: 2 resources.

- [ ] **Step 3: Bootstrap (build + push)**

Run:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo eu-central-1)
packages/functions/scripts/bootstrap.sh "$ACCOUNT_ID" "$REGION" latest
```

Expected: `packages/functions/api/dist/api.zip` exists, both ECR repos have a `:latest` image.

- [ ] **Step 4: Full apply**

Run: `terraform -chdir=packages/infrastructure apply`
Expected: everything else creates. Review the plan first.

- [ ] **Step 5: Deploy placeholder**

Run: `packages/editor/scripts/deploy-placeholder.sh`
Expected: 2xx from s3 cp + invalidation ID printed.

- [ ] **Step 6: Smoke tests**

```bash
curl -sS https://visual-resumes.isnan.eu/ | head -5
# → HTML matching packages/editor/index.html

curl -sS -o /dev/null -w '%{http_code}\n' https://visual-resumes.isnan.eu/api/resumes
# → 401 (no token)

aws lambda invoke --function-name visual-resumes-api /tmp/out.json && cat /tmp/out.json
# → {"statusCode":200, ... "stub":"api" ...}
```

---

### Task 19: Self-review

**Files:** none.

- [ ] **Step 1: Spec coverage check**

Re-read `docs/superpowers/specs/2026-04-18-visual-cv-design.md` sections "Architecture", "Domains & routing", "Infrastructure", "Identity & authorization". Confirm:
- [ ] 3 S3 buckets + public access blocks
- [ ] CloudFront with 3 behaviors (default editor, `/resumes/*`, `/api/*`) and 404-only SPA fallback
- [ ] OAC on editor + published
- [ ] Storage bucket CORS for presigned photo upload
- [ ] ACM wildcard via data source
- [ ] Route53 apex A-alias → CloudFront
- [ ] Cognito JWT authorizer wired via `local.cognito_issuer` + `[local.cognito_client_id]`
- [ ] ECR × 2 with lifecycle policy
- [ ] 3 Lambdas (1 zip, 2 image), correct memory/timeout/env
- [ ] API Gateway with 2 integrations (api, renderer) covering the spec's route list
- [ ] S3 → image-resizer on `users/*.(jpg|jpeg|png|webp)`
- [ ] IAM scoped per spec (api CRUD on data, revoke on public/resumes, invalidation; renderer read data + write public/resumes; image-resizer read/write photos)
- [ ] `editor_runtime_config` covers every field Plan 6's SPA needs

- [ ] **Step 2: Follow-ups explicitly deferred**
- Shared renderer + templates → Plan 2
- Real api handler → Plan 3
- Real image-resizer handler → Plan 4
- Real renderer handler → Plan 5
- Editor SPA + real deploy script → Plan 6

---

## Self-review checklist

- [ ] `terraform fmt` clean, `terraform validate` passes.
- [ ] No `aws_cognito_user_pool_client` or `aws_cognito_user_group` in this repo (both in Plan 0a).
- [ ] No `aws_acm_certificate` resource (wildcard reused via data source).
- [ ] `disable_execute_api_endpoint = false` on the API module (CloudFront origin reaches execute-api).
- [ ] CloudFront `/api/*` behavior uses `Managed-AllViewerExceptHostHeader` to forward `Authorization`.
- [ ] SPA fallback is 404 only — NOT 403.
- [ ] Versioning enabled on the `data` bucket (for free resume-edit history); disabled on `public` (assets are hashed).
- [ ] ECR lifecycle policy keeps last 10 images.
- [ ] `editor_runtime_config` output present and covers region, API base URL, Cognito client/pool/origin, redirect/logout URIs, scopes.

## Out of scope

- Real Lambda code (Plans 3, 4, 5).
- Shared renderer + templates (Plan 2).
- Editor SPA + real deploy (Plan 6 replaces the placeholder).
