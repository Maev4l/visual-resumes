# Plan 0a — Register `visual-resumes` app in `platform/idp`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No commits.** Do NOT run `git add`, `git commit`, or `git push` at any point. Leave all changes staged/unstaged for the user to review and commit manually.

**Goal:** Onboard the `visual-resumes` app to the shared Cognito user pool in `platform/idp` by adding its app client, its approval group, and registering its client ID in the shared `platform.idp.app-clients` SSM map — following the recipe in `platform/idp/CLAUDE.md`.

**Architecture:** In the `platform/idp` repo (NOT this repo), append three things to `cognito.tf`:
1. `aws_cognito_user_pool_client.visual_resumes` (Terraform local name — underscore; the Cognito `name` attribute is `"visual-resumes"` with a hyphen).
2. `aws_cognito_user_group.visual_resumes` (same convention).
3. A new entry `"visual-resumes"` in the existing `aws_ssm_parameter.app_clients` JSON map — **preserving every entry already present**.

Consumers (including this `visual-resumes` project) then discover their client ID via `jsondecode(data.aws_ssm_parameter.app_clients.value)["visual-resumes"]`.

**Tech Stack:** Terraform, AWS Cognito, AWS SSM Parameter Store.

**Repo this plan runs in:** `platform/idp` (NOT `visual-resumes`).

**Reference:** `platform/idp/CLAUDE.md` section "Adding a New App".

---

## Preconditions

- You are in the `platform/idp` repo.
- `cognito.tf` exists there and contains `aws_cognito_user_pool.idp`, `aws_cognito_identity_provider.google`, at least one existing `aws_cognito_user_pool_client.*` (+ matching group), and `aws_ssm_parameter.app_clients`.
- `terraform plan` is clean before starting.
- `git status` is clean (no uncommitted changes).

---

### Task 1: Inspect the existing `cognito.tf` and capture the current state

**Files:**
- Read-only: `platform/idp/cognito.tf`

- [ ] **Step 1: Read the full file**

Read `cognito.tf` end to end. Take note of:
- The resource name of the user pool (e.g. `aws_cognito_user_pool.idp`).
- Any existing `aws_cognito_user_pool_client.*` resource — record its exact attribute set (scopes, flows, token validity, `prevent_user_existence_errors`, `depends_on`, etc.). You will mirror this style for `resumes`.
- The `aws_ssm_parameter.app_clients` resource — record the **exact current `value` expression**. You will extend it without dropping any existing entry.

- [ ] **Step 2: Record the shape to scratch notes**

- Existing client resource name(s) and all their attributes.
- The full list of keys currently in `aws_ssm_parameter.app_clients.value`.
- Whether `aws_cognito_identity_provider.google` exists (required for `depends_on`).

No file changes at this task.

---

### Task 2: Add the `resumes` app client

**Files:**
- Modify: `platform/idp/cognito.tf`

- [ ] **Step 1: Append the resource**

Append at the bottom of `cognito.tf`. If the existing client in Task 1 declared extra attributes (e.g. `access_token_validity`, `id_token_validity`, `refresh_token_validity`, `token_validity_units`, `enable_token_revocation`), add them here too with the same values so the style stays consistent.

```hcl
resource "aws_cognito_user_pool_client" "visual_resumes" {
  name         = "visual-resumes"
  user_pool_id = aws_cognito_user_pool.idp.id

  supported_identity_providers         = ["COGNITO", "Google"]
  # Redirect to `/` (not `/auth/callback`): S3+OAC returns 403 on missing keys rather than 404,
  # so CloudFront's `custom_error_response` SPA fallback doesn't catch deep-route redirects.
  # Landing on `/` always serves index.html; Amplify reads the `?code` query param on mount.
  callback_urls                        = ["https://visual-resumes.isnan.eu/", "http://localhost:5178/"]
  logout_urls                          = ["https://visual-resumes.isnan.eu/", "http://localhost:5178/"]
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  allowed_oauth_flows_user_pool_client = true
  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"

  depends_on = [aws_cognito_identity_provider.google]
}
```

- [ ] **Step 2: Validate**

Run: `terraform fmt cognito.tf && terraform validate`
Expected: clean + `Success! The configuration is valid.`

---

### Task 3: Add the `resumes` user group

**Files:**
- Modify: `platform/idp/cognito.tf`

- [ ] **Step 1: Append**

```hcl
resource "aws_cognito_user_group" "visual_resumes" {
  name         = "visual-resumes"
  user_pool_id = aws_cognito_user_pool.idp.id
  description  = "Approved users for visual-resumes"
}
```

- [ ] **Step 2: Validate**

Run: `terraform fmt cognito.tf && terraform validate`
Expected: clean + valid.

---

### Task 4: Extend the `app_clients` SSM map — **preserving every existing entry**

**Files:**
- Modify: `platform/idp/cognito.tf`

- [ ] **Step 1: Locate the existing `aws_ssm_parameter.app_clients` resource**

You recorded its current `value` shape in Task 1. It looks roughly like:

```hcl
resource "aws_ssm_parameter" "app_clients" {
  name  = "platform.idp.app-clients"
  type  = "String"
  value = jsonencode({
    # ... one or more entries of the form "<app-name>" = aws_cognito_user_pool_client.<app>.id
  })
}
```

- [ ] **Step 2: Add one new key — `visual-resumes`**

Add a single new line inside the `jsonencode({...})` block:

```hcl
    "visual-resumes" = aws_cognito_user_pool_client.visual_resumes.id
```

**Do not rewrite existing lines. Do not remove any key. Do not reformat the map beyond what `terraform fmt` produces.** The goal is a minimal diff that only introduces the new entry.

- [ ] **Step 3: Format + validate**

Run: `terraform fmt cognito.tf && terraform validate`
Expected: clean + valid.

- [ ] **Step 4: Plan**

Run: `terraform plan`
Expected:
- 2 resources to ADD: `aws_cognito_user_pool_client.visual_resumes`, `aws_cognito_user_group.visual_resumes`.
- 1 resource to UPDATE in place: `aws_ssm_parameter.app_clients` (the `value` gains the `visual-resumes` key; every pre-existing key is still in the plan output).

**Stop here and leave the diff uncommitted for the user to review.** Report back with:
- The `terraform plan` summary.
- Explicit confirmation that no existing `app_clients` keys were dropped.

---

### Task 5: Apply and verify (user-gated — only run when the user says apply)

> Do NOT run `terraform apply` on your own. Wait for explicit approval. Once approved:

- [ ] **Step 1: Apply**

Run: `terraform apply`
Expected: the plan from Task 4 Step 4 completes with exactly the same numbers.

- [ ] **Step 2: Verify the client exists**

Run:

```bash
POOL_ID=$(aws cognito-idp list-user-pools --max-results 10 \
  --query "UserPools[?Name=='platform-idp'].Id | [0]" --output text)

aws cognito-idp list-user-pool-clients --user-pool-id "$POOL_ID" \
  --query 'UserPoolClients[?ClientName==`visual-resumes`].{name:ClientName,id:ClientId}'
```

Expected: one entry with ClientName `visual-resumes`.

- [ ] **Step 3: Verify the group**

Run:

```bash
aws cognito-idp list-groups --user-pool-id "$POOL_ID" \
  --query "Groups[?GroupName=='visual-resumes']"
```

Expected: one entry with GroupName `visual-resumes`.

- [ ] **Step 4: Verify the SSM map**

Run: `aws ssm get-parameter --name platform.idp.app-clients --query 'Parameter.Value' --output text | jq .`
Expected: JSON containing a `visual-resumes` key with a client-id string as its value, alongside every entry that was there before Task 4.

---

### Task 6: Update `platform/idp/CLAUDE.md` app table

**Files:**
- Modify: `platform/idp/CLAUDE.md`

- [ ] **Step 1: Add a row**

Find the Apps table (columns `App | Client | Group`) and append:

```
| Visual Resumes   | visual-resumes  | visual-resumes  |
```

Align whitespace with the existing row(s).

- [ ] **Step 2: Leave uncommitted**

Do not commit. The user reviews and commits.

---

## Self-review checklist

- [ ] The new app client uses `depends_on = [aws_cognito_identity_provider.google]` so Google federation works on first creation.
- [ ] Callback URLs include both the production (`https://visual-resumes.isnan.eu/`) and local-dev (`http://localhost:5178/`) endpoints. Redirect is the site root, not `/auth/callback`, so the SPA fallback works without CloudFront rewriting.
- [ ] Scopes, flows, `supported_identity_providers`, `prevent_user_existence_errors`, and any per-project validity attributes match the style of the existing client resource(s) you recorded in Task 1.
- [ ] `aws_ssm_parameter.app_clients` still contains every pre-existing key — only the `visual-resumes` key was added.
- [ ] `platform/idp/CLAUDE.md` Apps table reflects the new row.
- [ ] No `git` commands were run. All changes are uncommitted.

## Out of scope

- Any changes in the `visual-resumes` repo (Plan 1 consumes what this plan registers).
- User approval workflow (manual: admin adds users to the `resumes` group after sign-in triggers the existing PostAuthentication SNS notification).
