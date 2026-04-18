# Plan 0b — `lambda-trigger-apigw` module rewrite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No commits.** Do NOT run `git add`, `git commit`, or `git push` at any point. Leave all changes staged/unstaged for the user to review and commit manually.

**Goal:** Rewrite the `lambda-trigger-apigw` Terraform module in the `terraform-modules` repo from a single-Lambda interface to a map-of-integrations interface, so a single HTTP API + authorizer + custom domain can fan out to multiple Lambda functions (each owning a subset of routes).

**Architecture:** Replace the current `function_name`/`function_arn`/`invoke_arn`/`routes` scalar inputs with a `map(object(...))` of integrations. Under the hood: one `aws_apigatewayv2_integration` per map entry (via `for_each`), one `aws_apigatewayv2_route` per (integration × route) pair (via a flattened map), one `aws_lambda_permission` per integration. The API Gateway, authorizer, custom domain, stage, and ACM wiring stay single-instance.

**Tech Stack:** Terraform, AWS API Gateway v2 (HTTP API), AWS Lambda.

**Repo this plan runs in:** `terraform-modules` (NOT `visual-resumes`).

**Non-goals for this plan:** migrating any existing consumer of the module to the new interface. The user will handle module republish and consumer migrations manually after this plan completes.

**Execution note:** This is a **breaking change** to a published module. The user will tag/publish the new version themselves.

---

## Preconditions

- You are in the `terraform-modules` repo.
- `modules/lambda-trigger-apigw/` exists with `main.tf`, `variables.tf`, `outputs.tf`, `README.md`.
- You have verified the current shape of inputs by reading `variables.tf` — it currently exposes `function_name`, `function_arn`, `invoke_arn`, `routes`.
- The module may have one or more existing consumers in other repos. Do **NOT** touch any consumer code — this plan only modifies files under `modules/lambda-trigger-apigw/`.

---

### Task 1: Read current module to lock in a baseline

**Files:**
- Read-only: `modules/lambda-trigger-apigw/main.tf`, `variables.tf`, `outputs.tf`, `README.md`

- [ ] **Step 1: Confirm the current shape**

The module today (pre-rewrite) exposes these inputs:
- **To remove in this rewrite:** `function_name`, `function_arn`, `invoke_arn`, `routes`.
- **To keep as-is:** `stage_name` (default `"$default"`), `custom_domain = { domain_name, hosted_zone_id, certificate_arn }` (optional), `authorizer = { name, issuer, audience, identity_sources? }` (optional), `cors` (null/false/true/object), `disable_execute_api_endpoint` (default `true`), `tags`.

The main.tf currently defines:
- `aws_apigatewayv2_api.this` with `name = "${var.function_name}-http-api"` — the `name` expression must change to `"${var.api_name}-http-api"` or just `var.api_name`.
- `aws_apigatewayv2_stage.this` — stays singleton.
- `aws_apigatewayv2_integration.this` — singular → becomes `for_each = var.integrations`.
- `aws_apigatewayv2_route.this` — `for_each = toset(var.routes)` → becomes `for_each = local.route_pairs` keyed by "int_key:route".
- `aws_lambda_permission.this` — singleton → becomes `for_each = var.integrations` with `statement_id = "AllowAPIGatewayInvoke-${each.key}"`.
- Authorizer resource (conditional on `var.authorizer != null`) — stays singleton, used by all routes that specify a JWT.
- Custom domain / mapping / Route 53 record (conditional on `var.custom_domain != null`) — stay singleton.

- [ ] **Step 2: Record invariants that must NOT change**
  - Single `aws_apigatewayv2_api`.
  - Single authorizer (all routes share the one JWT authorizer; per-integration override is out of scope).
  - Single custom domain / stage / cert.
  - Default stage (`$default`) auto-deploy behavior.
  - `cors`, `disable_execute_api_endpoint`, `tags` semantics unchanged.

No commit.

---

### Task 2: Rewrite `variables.tf`

**Files:**
- Modify: `modules/lambda-trigger-apigw/variables.tf`

- [ ] **Step 1: Remove the old Lambda-scoped inputs**

Delete the `function_name`, `function_arn`, `invoke_arn`, and `routes` variables. Keep `stage_name`, `custom_domain`, `authorizer`, `cors`, `disable_execute_api_endpoint`, and `tags` exactly as they are.

- [ ] **Step 2: Add `api_name`**

```hcl
variable "api_name" {
  description = "Name of the HTTP API (used for resource naming and tags)."
  type        = string
}
```

- [ ] **Step 3: Add `integrations`**

```hcl
variable "integrations" {
  description = <<-EOT
    Map of Lambda integrations keyed by logical name (e.g. "api", "renderer").
    Each entry wires one Lambda function to one or more routes.
    Routes use HTTP API route-key syntax: "METHOD /path" (e.g. "POST /api/resumes/{id}/publish").
  EOT
  type = map(object({
    function_name = string
    function_arn  = string
    invoke_arn    = string
    routes        = list(string)
  }))

  validation {
    condition     = length(var.integrations) > 0
    error_message = "At least one integration is required."
  }
}
```

- [ ] **Step 4: Format and validate**

Run: `terraform fmt modules/lambda-trigger-apigw/variables.tf`
Expected: no changes (already formatted) or clean reformat.

Run: `terraform -chdir=modules/lambda-trigger-apigw init -backend=false && terraform -chdir=modules/lambda-trigger-apigw validate`
Expected: validation will fail here because `main.tf` still references the removed variables — that's fine, we fix it in the next task.

- [ ] **Step 5: Commit**

```bash
git add modules/lambda-trigger-apigw/variables.tf
git commit -m "refactor(lambda-trigger-apigw): switch inputs to map of integrations"
```

---

### Task 3: Rewrite `aws_apigatewayv2_api` naming

**Files:**
- Modify: `modules/lambda-trigger-apigw/main.tf`

- [ ] **Step 1: Update the API resource name argument**

Find `resource "aws_apigatewayv2_api" "this"` and change:

```hcl
name = "${var.function_name}-http-api"
```

to:

```hcl
name = "${var.api_name}-http-api"
```

Preserve the surrounding `protocol_type`, `disable_execute_api_endpoint`, `tags`, and the `dynamic "cors_configuration"` block — they remain unchanged.

- [ ] **Step 2: Validate syntax**

Run: `terraform -chdir=modules/lambda-trigger-apigw validate`
Expected: still fails on integration/route references — expected.

No commit yet.

---

### Task 4: Replace single integration with `for_each` integrations

**Files:**
- Modify: `modules/lambda-trigger-apigw/main.tf`

- [ ] **Step 1: Replace the existing `aws_apigatewayv2_integration` resource**

Old:

```hcl
resource "aws_apigatewayv2_integration" "this" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}
```

New:

```hcl
resource "aws_apigatewayv2_integration" "this" {
  for_each = var.integrations

  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = each.value.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}
```

- [ ] **Step 2: Validate**

Run: `terraform -chdir=modules/lambda-trigger-apigw validate`
Expected: still fails on route references — next task.

No commit yet.

---

### Task 5: Flatten routes and rewrite `aws_apigatewayv2_route`

**Files:**
- Modify: `modules/lambda-trigger-apigw/main.tf`

- [ ] **Step 1: Add a local that flattens integrations × routes**

Add near the top of `main.tf` (after the provider/terraform blocks but before resources):

```hcl
locals {
  # Flatten { int_key => { routes = [...] } } into a map keyed by "int_key:route"
  # so each (integration, route) pair can be a distinct resource via for_each.
  route_pairs = merge([
    for int_key, int in var.integrations : {
      for route in int.routes :
      "${int_key}:${route}" => {
        integration_key = int_key
        route_key       = route
      }
    }
  ]...)
}
```

- [ ] **Step 2: Replace the existing `aws_apigatewayv2_route` resource**

Old:

```hcl
resource "aws_apigatewayv2_route" "this" {
  for_each = toset(var.routes)

  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.this.id}"
  authorization_type = local.create_authorizer ? "JWT" : "NONE"
  authorizer_id      = local.create_authorizer ? aws_apigatewayv2_authorizer.this[0].id : null
}
```

New:

```hcl
resource "aws_apigatewayv2_route" "this" {
  for_each = local.route_pairs

  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.value.route_key
  target             = "integrations/${aws_apigatewayv2_integration.this[each.value.integration_key].id}"
  authorization_type = local.create_authorizer ? "JWT" : "NONE"
  authorizer_id      = local.create_authorizer ? aws_apigatewayv2_authorizer.this[0].id : null
}
```

Note the preserved `local.create_authorizer` gate — the authorizer is still optional at the module level.

- [ ] **Step 3: Validate**

Run: `terraform -chdir=modules/lambda-trigger-apigw validate`
Expected: still fails on `aws_lambda_permission` — next task.

No commit yet.

---

### Task 6: Rewrite `aws_lambda_permission`

**Files:**
- Modify: `modules/lambda-trigger-apigw/main.tf`

- [ ] **Step 1: Replace the resource**

Old:

```hcl
resource "aws_lambda_permission" "this" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
```

New:

```hcl
resource "aws_lambda_permission" "this" {
  for_each = var.integrations

  statement_id  = "AllowAPIGatewayInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = each.value.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
```

- [ ] **Step 2: Validate**

Run: `terraform -chdir=modules/lambda-trigger-apigw validate`
Expected: PASS.

- [ ] **Step 3: Format**

Run: `terraform fmt modules/lambda-trigger-apigw/`
Expected: clean.

- [ ] **Step 4: Commit (bundled)**

```bash
git add modules/lambda-trigger-apigw/main.tf
git commit -m "refactor(lambda-trigger-apigw): fan out integrations/routes/permissions via for_each"
```

---

### Task 7: Audit outputs

**Files:**
- Modify: `modules/lambda-trigger-apigw/outputs.tf`

- [ ] **Step 1: Read existing outputs**

Read the file. Expected existing outputs commonly include `api_id`, `api_endpoint`, `execution_arn`, `invoke_url` (or domain-based URL).

- [ ] **Step 2: Remove or rework integration-scoped outputs**

If any output references `aws_apigatewayv2_integration.this.id` (singular) or `var.function_name`/`var.invoke_arn`, remove it or convert to a map:

```hcl
output "integration_ids" {
  description = "Map of integration logical name → integration ID."
  value       = { for k, int in aws_apigatewayv2_integration.this : k => int.id }
}
```

Keep API-level outputs (`api_id`, `api_endpoint`, custom domain, hosted zone ID, stage invoke URL) unchanged.

- [ ] **Step 3: Validate and format**

Run: `terraform -chdir=modules/lambda-trigger-apigw validate && terraform fmt modules/lambda-trigger-apigw/`
Expected: PASS, clean formatting.

- [ ] **Step 4: Commit**

```bash
git add modules/lambda-trigger-apigw/outputs.tf
git commit -m "refactor(lambda-trigger-apigw): rework outputs for multi-integration shape"
```

---

### Task 8: Regenerate README

**Files:**
- Rewrite: `modules/lambda-trigger-apigw/README.md`

- [ ] **Step 1: Replace README with the new interface docs**

```markdown
# lambda-trigger-apigw

Creates an HTTP API Gateway v2 endpoint with a JWT authorizer and fans out multiple Lambda integrations, each owning a subset of routes.

## What it provisions

- 1 × `aws_apigatewayv2_api` (HTTP API)
- 1 × `aws_apigatewayv2_authorizer` (JWT)
- 1 × `aws_apigatewayv2_stage` (`$default`, auto-deploy)
- 1 × `aws_apigatewayv2_domain_name` + `aws_apigatewayv2_api_mapping`
- 1 × `aws_route53_record` (A / alias → API Gateway domain)
- N × `aws_apigatewayv2_integration` (one per entry in `integrations`)
- M × `aws_apigatewayv2_route` (one per `METHOD /path` across all integrations)
- N × `aws_lambda_permission` (one per integration, unique `statement_id`)

## Usage

```hcl
module "api" {
  source = "github.com/Maev4l/terraform-modules//modules/lambda-trigger-apigw?ref=v1.7.0"  # new tag cut after this rewrite

  api_name                     = "visual-resumes"
  disable_execute_api_endpoint = false   # required when fronted by CloudFront

  authorizer = {
    name     = "visual-resumes-cognito-authorizer"
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${data.aws_cognito_user_pools.shared.ids[0]}"
    audience = [local.cognito_client_id]
  }

  cors = false  # CloudFront is same-origin; API is only hit via /api/* path

  integrations = {
    api = {
      function_name = module.lambda_api.function_name
      function_arn  = module.lambda_api.function_arn
      invoke_arn    = module.lambda_api.invoke_arn
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
      function_name = module.lambda_renderer.function_name
      function_arn  = module.lambda_renderer.function_arn
      invoke_arn    = module.lambda_renderer.invoke_arn
      routes = [
        "POST /api/resumes/{id}/publish",
      ]
    }
  }
}
```

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `api_name` | `string` | — | Name of the HTTP API (used as `${api_name}-http-api` and for tags). |
| `integrations` | `map(object(...))` | — | See below. |
| `stage_name` | `string` | `"$default"` | API Gateway stage name. |
| `custom_domain` | `object({domain_name, hosted_zone_id, certificate_arn})` or `null` | `null` | Set to skip custom domain creation. |
| `authorizer` | `object({name, issuer, audience, identity_sources?})` or `null` | `null` | JWT authorizer applied to all routes when set. |
| `cors` | `null` / `false` / `true` / `object` | `null` | `true` for permissive defaults, object for custom config. |
| `disable_execute_api_endpoint` | `bool` | `true` | Set to `false` when fronted by CloudFront via execute-api URL. |
| `tags` | `map(string)` | `{}` | Tags applied to created resources. |

### `integrations` shape

```hcl
map(object({
  function_name = string
  function_arn  = string
  invoke_arn    = string
  routes        = list(string)  # HTTP API route keys: "METHOD /path"
}))
```

## Outputs

| Name | Description |
|---|---|
| `api_id` | HTTP API ID. |
| `api_endpoint` | Default execute-api endpoint. |
| `custom_domain` | Custom domain name. |
| `integration_ids` | Map of integration key → integration ID. |

## Breaking change from previous version

This module previously accepted `function_name`, `function_arn`, `invoke_arn`, `routes` at the module level (single Lambda). It now requires the `integrations` map. There is no backward-compatibility shim — consumers must migrate.
```

- [ ] **Step 2: Commit**

```bash
git add modules/lambda-trigger-apigw/README.md
git commit -m "docs(lambda-trigger-apigw): rewrite README for map-of-integrations interface"
```

---

### Task 9: Smoke-plan against a fake example

**Files:**
- Create (temporary): `modules/lambda-trigger-apigw/examples/smoke/main.tf`

- [ ] **Step 1: Create a minimal, non-applying example purely to run `terraform plan`**

```hcl
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 5.0" }
  }
}

provider "aws" {
  region = "eu-central-1"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  access_key                  = "fake"
  secret_key                  = "fake"
}

module "api" {
  source = "../.."

  api_name                     = "smoke"
  disable_execute_api_endpoint = false

  authorizer = {
    name     = "smoke-authorizer"
    issuer   = "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_FAKE"
    audience = ["fake-client"]
  }

  integrations = {
    a = {
      function_name = "fn-a"
      function_arn  = "arn:aws:lambda:eu-central-1:000000000000:function:fn-a"
      invoke_arn    = "arn:aws:apigateway:eu-central-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-central-1:000000000000:function:fn-a/invocations"
      routes        = ["GET /a", "POST /a/{id}"]
    }
    b = {
      function_name = "fn-b"
      function_arn  = "arn:aws:lambda:eu-central-1:000000000000:function:fn-b"
      invoke_arn    = "arn:aws:apigateway:eu-central-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-central-1:000000000000:function:fn-b/invocations"
      routes        = ["POST /b"]
    }
  }
}
```

- [ ] **Step 2: Run validate only (not plan — we have fake creds)**

Run: `terraform -chdir=modules/lambda-trigger-apigw/examples/smoke init -backend=false && terraform -chdir=modules/lambda-trigger-apigw/examples/smoke validate`
Expected: PASS.

- [ ] **Step 3: Check resource count expectation**

Inspect the generated plan structure mentally: 2 integrations → 2 × `aws_apigatewayv2_integration` + 2 × `aws_lambda_permission` + 3 × `aws_apigatewayv2_route` (2 for `a`, 1 for `b`) + all the singleton API/authorizer/domain/record resources. Confirm the `for_each` keys in local `route_pairs` are `a:GET /a`, `a:POST /a/{id}`, `b:POST /b`.

- [ ] **Step 4: Delete the smoke example**

Run: `rm -rf modules/lambda-trigger-apigw/examples/smoke`
Rationale: this example used fake credentials and is not meant to live in the repo. Keep real usage examples elsewhere if the repo already has an `examples/` convention.

- [ ] **Step 5: Commit (if any trace remains)**

If `.terraform*` files were git-ignored you have nothing to commit. Otherwise, make sure the smoke dir is fully removed.

---

### Task 10: Final self-review

**Files:** none.

- [ ] **Step 1: Re-read `main.tf`, `variables.tf`, `outputs.tf`, `README.md` end-to-end**

Confirm:
- No references to `var.function_name`, `var.function_arn`, `var.invoke_arn`, `var.routes` remain anywhere.
- Every resource that needed to fan out now has `for_each`.
- `aws_lambda_permission` uses unique `statement_id` per integration.
- Route `target` correctly indexes into the integrations map.

- [ ] **Step 2: Run the full format + validate cycle once more**

Run: `terraform fmt -recursive modules/lambda-trigger-apigw && terraform -chdir=modules/lambda-trigger-apigw validate`
Expected: clean + PASS.

- [ ] **Step 3: Print a final summary of changes for the commit log** (for the user, not a commit)

Quickly list: "Variables: removed 4, added 2. Resources: 1 integration → for_each, 1 route → for_each on flattened pairs, 1 permission → for_each. Outputs: singular integration output replaced with map. README: rewritten."

---

## Self-review checklist

- [ ] No backward-compatibility shim: old inputs are gone.
- [ ] `statement_id` on `aws_lambda_permission` is unique per integration (AWS requires this).
- [ ] Route key flattening preserves every `METHOD /path` from every integration.
- [ ] `api_name` decoupled from any specific function name.
- [ ] README documents the breaking change explicitly.
- [ ] `terraform fmt -recursive` and `terraform validate` both pass.
- [ ] No consumer repos are modified — this plan only edits files under `modules/lambda-trigger-apigw/`.
- [ ] No `git` commands were run. All changes are uncommitted.

## Out of scope

- Migrating any existing consumer to the new interface — the user handles that separately.
- Publishing / tagging the new module version (user does this manually after this plan).
- Changes to any `visual-resumes` Terraform (covered in Plan 1).
- Any `git` operations — user commits all changes manually.
