# Visual CV (Resumes v2) — Design

**Date:** 2026-04-18
**Status:** Approved for planning
**Domain:** `visual-resumes.isnan.eu`

## Overview

Web application for authoring visual CVs. Authorized users (~5, closed circle) create structured resume documents, pick a template, edit sections in a form, preview, and publish. Published resumes are shareable via unguessable URLs as HTML or PDF. The app reuses the existing `platform/idp` Cognito user pool and `terraform-modules` Lambda/S3 modules.

## Goals

- Closed user base reusing existing IDP (Cognito + Google federated sign-in)
- Multiple resumes per user (for language or role variants)
- Universal section catalog; templates control presentation only
- Form-based editor with up/down section reordering and a toggle-preview
- Server-rendered HTML + PDF published as static artifacts to S3/CloudFront
- Manual publish / unpublish (no auto-expiry)

## Non-goals (v2.0)

- Public signup
- Multi-user collaboration on a single resume
- User-authored templates
- Drag-and-drop reordering
- Auto-expiry of published artifacts
- WYSIWYG paginated editor

## Architecture

### Components

| Component | Tech | Packaging |
|---|---|---|
| Editor SPA | Vite + React, plain JavaScript | Static site on S3 + CloudFront |
| `api` Lambda | Node.js 22 | zip (<50MB), 256MB mem, 10s timeout |
| `renderer` Lambda | Node.js 22 + `@sparticuz/chromium` | Container (ECR), 2048MB mem, 60s timeout |
| `image-resizer` Lambda | Node.js 22 + `sharp` | Container (ECR), 1024MB mem, 30s timeout |
| Storage | 3 × S3 buckets (editor / private / published) | Private, OAC-restricted CloudFront access where applicable |
| Edge | 1 × CloudFront distribution with path-routed behaviors | — |
| HTTP API | 1 × API Gateway HTTP API (two Lambda integrations) | Cognito JWT authorizer |

### High-level flow

```
Editor SPA ──► /api/*  ──► API Gateway ──► api Lambda     ──► S3 resumes-private (JSON + photos)
                                      └──► renderer Lambda ──► S3 resumes-published (HTML + PDF + photo)
                                                                             ▲
                                                                             │
Viewer     ──► /resumes/{slug}.{html|pdf|jpg} ──── CloudFront ────────────────┘
```

## Domains & routing

Single CloudFront distribution on `visual-resumes.isnan.eu` with four behaviors:

| Path | Origin | Cache | Notes |
|---|---|---|---|
| `/api/*` | API Gateway (execute-api URL) | Disabled | Forwards `Authorization`; managed origin request policy `AllViewerExceptHostHeader` |
| `/resumes/*` | S3 `resumes-published` (OAC) | Long (1y), immutable on slug | No JS required to view |
| `/*` (default) | S3 `resumes-editor` (OAC) | Per-object `Cache-Control` (hashed assets immutable, `index.html` `no-cache`) | CloudFront Function (viewer-request) rewrites any path whose last segment has no `.` to `/index.html` so SPA deep-links (`/edit/{id}`, `/preview/{id}`, …) work. 404 fallback retained as belt-and-braces. **403 must NOT be mapped** — it would mask API Gateway auth errors. |

## Identity & authorization

- Reuse `platform/idp` Cognito user pool (no new user pool created here).
- New Cognito app client `resumes` and user group `resumes` created via Terraform in this repo.
- Approval workflow inherited from `platform/idp` (PostAuthentication trigger sends SNS on first login; admin adds user to group).
- API Gateway JWT authorizer validates ID tokens issued by the shared pool.
- `custom:Id` claim from the ID token is used as the per-user S3 prefix.
- Viewer URLs (`/resumes/*`) are unauthenticated; protected only by slug entropy. Manual unpublish deletes the artifacts.
- Manual step (documented in README): append `"resumes": <new-client-id>` to the `platform.idp.app-clients` SSM parameter in the `platform/idp` repo.

## Data model

### Resume document

```jsonc
{
  "id": "<ulid>",
  "ownerCustomId": "<Cognito custom:Id>",
  "title": "EN — Developer",              // internal label, not shown publicly
  "templateId": "monaco",
  "paperSize": "A4" | "Letter",
  "photoKey": "users/<customId>/photos/<resumeId>.jpg" | null,
  "sections": [                           // index = render order
    {
      "id": "<ulid>",
      "type": "contact" | "summary" | "experience" | "education" |
              "skills" | "projects" | "languages" | "certifications",
      "customTitle": "Work Experience",   // optional override of default label
      "pageBreakBefore": false,
      "data": { /* type-specific payload, see catalog below */ }
    }
  ],
  "published": {
    "slug": "<nanoid 12 chars>",
    "publishedAt": "2026-04-18T12:00:00Z"
  } | null
}
```

No `expiresAt` — expiry is manual only via an Unpublish action.

### Section catalog (MVP v2.0)

| Type | Shape |
|---|---|
| `contact` | `{ name, email, phone?, location?, links: [{label, url}] }` |
| `summary` | `{ text: markdown }` |
| `experience` | `[{ company, role, location?, startDate, endDate?, current, bullets: markdown[] }]` |
| `education` | `[{ institution, degree, field?, startDate, endDate?, notes? }]` |
| `skills` | `[{ group?, items: string[] }]` |
| `projects` | `[{ name, description, link?, tech: string[], bullets: markdown[] }]` |
| `languages` | `[{ language, proficiency }]` |
| `certifications` | `[{ name, issuer, date, link? }]` |

Markdown in fields: `markdown-it` default config — bold, italic, code, links only. No headings, tables, images, or HTML.

Adding new types post-launch is schema-compatible: templates that don't recognize a type skip it.

### Storage layout (S3)

**`resumes-private`** (private; IAM access only for `api` and `image-resizer`):
```
users/{customId}/
  resumes/{resumeId}.json
  photos/{resumeId}.{jpg|png|webp}
  photos/{resumeId}-thumb.jpg
```

**`resumes-published`** (private bucket, read via CloudFront OAC; write from `renderer`):
```
resumes/{slug}.html
resumes/{slug}.pdf
resumes/{slug}.jpg     // copied and re-encoded from the user's photo at publish time
```

**`resumes-editor`** (private bucket, read via CloudFront OAC):
```
/ (SPA assets)
```

### Concurrency

`PUT /api/resumes/{id}` uses S3 `If-Match` with the ETag returned on `GET`. On 412, editor refetches and retries. Enable S3 versioning on `resumes-private` for free edit history.

### Slug generation

`nanoid` with alphabet `0123456789abcdefghijklmnopqrstuvwxyz`, length 12. Generated on first publish, stored on the document, reused on republish.

## Templates

### Layout

```
packages/templates/<name>/
  template.hbs
  style.css
  meta.json        // { name, description, supportsPhoto, supportedPaperSizes, previewPng }
  preview.png
```

Starter templates for v2.0: `monaco` (single column), `modern` (two column with sidebar). Third can be added post-launch.

### Rendering pipeline

1. `packages/shared/renderer.js` loads `template.hbs` and `style.css`.
2. Renders HTML via Handlebars (helpers: markdown → HTML, date formatting via `dayjs`).
3. Inlines CSS into `<style>` in `<head>` → self-contained HTML output.
4. (Publish only) `renderer` Lambda uses `@sparticuz/chromium` + `puppeteer-core` to `page.setContent(html)` → `page.pdf({ format: paperSize })`.
5. Uploads HTML, PDF, and copied/re-encoded photo to `resumes-published/resumes/`.

This same renderer module runs **in the browser** (Vite bundle includes Handlebars) for the editor's Preview action. No preview Lambda needed.

### Page-break handling

Template CSS includes:

```css
.section { break-inside: avoid; }
.section h2 { break-after: avoid; }
.entry { break-inside: avoid; }
.page-break { break-before: always; }
@page { size: A4; margin: 12mm; }   /* size varies per paperSize at render time */
```

Editor exposes a per-section and per-entry "Insert page break before this" toggle → renders `<div class="page-break"></div>` immediately before.

### Published artifact self-containment

- CSS inlined in `<style>` in `<head>`.
- Photo referenced as relative URL `./{slug}.jpg`.
- Fonts: system stack by default. If a template bundles a font, embed woff2 as base64 inside the `@font-face` block.
- Tiny inline `<script>` reads `?picture=false` query param to toggle a CSS class hiding the photo.

### Photo handling

- Accepted: JPEG, PNG, WebP; max 5MB (client + presigned-URL policy).
- Editor gets a presigned `PUT` URL via `POST /api/resumes/{id}/photo`, uploads directly to `resumes-private`.
- `image-resizer` triggered by S3 event on `users/*/photos/*` creates `*-thumb.jpg` (400×400, JPEG q85) — used for editor preview only.
- At publish: `renderer` reads the original, re-encodes to JPEG q85 max 600px longest side, writes to `resumes-published/resumes/{slug}.jpg`.

## User flows

### Sign-in

1. User hits `https://visual-resumes.isnan.eu` → SPA shell loads.
2. No session → redirect to `platform/idp` Cognito Hosted UI (client = `resumes`).
3. Cognito redirects to `/auth/callback?code=...`.
4. SPA exchanges code for tokens, holds ID token in memory (not localStorage, not cookie).
5. Not in `resumes` group → API returns 403 → SPA shows "Pending approval — admin notified" (SNS notification sent by the IDP's existing PostAuthentication trigger).

### Dashboard (`/`)

- `GET /api/resumes` → list user's resumes (title, template, last-updated, publish status).
- Per-row actions: Edit, Duplicate, Unpublish (if published), Delete.
- "Create new" → `/new`.

### Create (`/new`)

1. Template picker (grid from `packages/templates/*/preview.png`).
2. Enter title + paper size (A4 default).
3. `POST /api/resumes` → empty `sections` → redirects to `/edit/{id}`.

### Edit (`/edit/{id}`)

- Left pane: form.
  - Section list with add / remove / up / down.
  - Per section: typed fields (per catalog) with per-entry add / remove / up / down.
  - Photo upload button → presigned URL → direct S3 upload.
  - "Insert page break before" toggle on sections and entries.
- Top bar: **Preview** toggle → full-width `<iframe srcdoc>` with client-side-rendered HTML (using `packages/shared/renderer.js` + current form state).
- **Save** → `PUT /api/resumes/{id}` with `If-Match: <etag>`. 412 → toast + refresh.
- **Publish** → header CTA is context-aware:
  - When **unpublished**: "Publish" button opens a modal that confirms and then calls `POST /api/resumes/{id}/publish` (routed via API Gateway to the `renderer` Lambda); the success view in the same modal shows the copyable HTML/PDF URLs.
  - When **already published**: the header shows two affordances — a clickable "● Published" chip (oxblood dot + label) that opens the modal for URL inspection / unpublish, and an "Update published" primary button that **one-click** re-publishes (no modal). Re-publish flushes any pending autosave first, then calls the same publish endpoint (idempotent on the slug — overwrites HTML/PDF + invalidates CloudFront), and surfaces the result via a toast with an inline Copy-URL action. The modal also exposes both "Update published" (primary) and "Unpublish" (secondary, destructive) so users who entered via the chip don't have to back out to re-publish.

### Unpublish

- `POST /api/resumes/{id}/revoke` → `api` Lambda deletes the 3 S3 objects and issues a CloudFront invalidation on `/resumes/{slug}.*`.

### Delete resume

- Deletes the resume JSON, photo, thumbnail, and (if published) the published artifacts + invalidation.

### Republish

- Reuses the same slug. Overwrites HTML, PDF, photo objects. Invalidates CloudFront so viewers see the new version.
- Back-writes `published: {slug, publishedAt}` onto the resume JSON with `IfMatch: <pre-publish ETag>`. This rotates the JSON's S3 ETag — the API surfaces the new ETag in both the response body (`etag` field) and the HTTP `etag` response header so the editor can update `state.etag`. Without this, every autosave after publish would 412 with "stale ETag".
- If the back-write itself 412s (genuinely concurrent edit during publish), the API returns `conflict: true` with no `etag`; the client refetches.

## API

All routes under `/api/*`, all require Cognito JWT (`Authorization: Bearer <id_token>`), claims attached to the integration event.

| Route | Lambda | Description |
|---|---|---|
| `GET /api/resumes` | api | List my resumes |
| `POST /api/resumes` | api | Create (body: `{ title, templateId, paperSize }`) |
| `GET /api/resumes/{id}` | api | Fetch one (returns `{ resume, etag }`) |
| `PUT /api/resumes/{id}` | api | Save (`If-Match` required) |
| `DELETE /api/resumes/{id}` | api | Delete (+ revoke if published) |
| `POST /api/resumes/{id}/photo` | api | Returns presigned PUT URL |
| `POST /api/resumes/{id}/publish` | renderer | Renders HTML + PDF, uploads, conditionally back-writes `published: {slug, publishedAt}` onto the resume JSON, invalidates CloudFront. Returns `{ slug, hasPhoto, etag, conflict }`. The `etag` (also exposed as the `etag` HTTP response header) is the resume-JSON's new ETag — the editor rotates `state.etag` to it so the next autosave doesn't 412. `conflict: true` (and no `etag`) is set when the back-write 412'd because of a concurrent edit during publish — client should refetch. |
| `POST /api/resumes/{id}/revoke` | api | Deletes published artifacts + invalidates CloudFront |

## Infrastructure

### Terraform-modules reused (from `../terraform-modules/modules/`)

- `lambda-function` — used 3× (`api`, `renderer`, `image-resizer`)
- `lambda-trigger-apigw` — used 1× (see module change below)
- `lambda-trigger-s3` — used 1× (`image-resizer` on `photos/*`)

### Module change required: `lambda-trigger-apigw`

Replace single-Lambda interface with a map of integrations, all sharing one API Gateway + authorizer + custom domain.

**`variables.tf`:** remove `function_name`, `function_arn`, `invoke_arn`, `routes`. Add:

```hcl
variable "api_name" {
  description = "Name of the HTTP API (used for resource naming)"
  type        = string
}

variable "integrations" {
  description = "Map of Lambda integrations keyed by logical name."
  type = map(object({
    function_name = string
    function_arn  = string
    invoke_arn    = string
    routes        = list(string)
  }))
}
```

**`main.tf`:**
- `aws_apigatewayv2_api.this.name` uses `var.api_name`.
- `aws_apigatewayv2_integration.this` uses `for_each = var.integrations`.
- Route flattening via `merge([for int_key, int in var.integrations : { for route in int.routes : "${int_key}:${route}" => { integration_key, route_key } } ]...)`.
- `aws_apigatewayv2_route.this` targets `aws_apigatewayv2_integration.this[each.value.integration_key].id`.
- `aws_lambda_permission.this` uses `for_each = var.integrations` with unique `statement_id = "AllowAPIGatewayInvoke-${each.key}"`.

Not backward-compatible. The one existing consumer (`cardgames-score`) must be migrated to the new interface. README.md regenerated.

This module change ships to `terraform-modules` first; this project depends on it.

### Resources in this repo's Terraform

- 3 × `aws_s3_bucket` (editor, private, published) + OAC policies
- 1 × `aws_cloudfront_distribution` with four path-routed behaviors (custom — not via `s3-static-site` module, because we need multiple origins on one distribution)
- 1 × `aws_acm_certificate` in us-east-1 for `visual-resumes.isnan.eu`
- 1 × `aws_route53_record` apex → CloudFront
- Lambdas via `lambda-function` module (×3), ECR repos for the 2 container ones
- `lambda-trigger-apigw` module invocation (primary integration = `api`, additional = `renderer`, JWT authorizer bound to the shared user pool)
- `lambda-trigger-s3` module invocation for `image-resizer`
- `aws_cognito_user_pool_client.resumes` + `aws_cognito_user_group.resumes` against `data.aws_ssm_parameter.platform_idp_user_pool_id`
- IAM: `api` role grants `s3:{Get,Put,Delete}Object` on `resumes-private/users/*`; `renderer` role grants read on `resumes-private` + write on `resumes-published`; `image-resizer` role grants read+write on `resumes-private/users/*/photos/*`.
- S3 bucket notification: `users/*/photos/*.jpg|png|webp` PUT → `image-resizer`.

### Environment variables (Lambdas)

- `api`: `RESUMES_PRIVATE_BUCKET`, `RESUMES_PUBLISHED_BUCKET`, `CLOUDFRONT_DIST_ID`, `PUBLIC_HOST=visual-resumes.isnan.eu`
- `renderer`: `RESUMES_PRIVATE_BUCKET`, `RESUMES_PUBLISHED_BUCKET`, `TEMPLATES_DIR` (baked in image), `PUBLIC_HOST`
- `image-resizer`: `RESUMES_PRIVATE_BUCKET`

## Project structure

```
/
├── package.json                    # root scripts (yarn --cwd per package, no workspaces)
├── docs/superpowers/specs/         # this spec
└── packages/
    ├── editor/                     # SPA (own yarn.lock)
    │   ├── package.json            # vite, react, handlebars, markdown-it, nanoid, ...
    │   ├── src/
    │   ├── scripts/deploy.sh       # s3 sync + cloudfront invalidate
    │   └── vite.config.js
    ├── functions/                  # all Lambda handlers (own yarn.lock)
    │   ├── package.json            # aws-sdk, handlebars, markdown-it, puppeteer-core,
    │   │                             @sparticuz/chromium, sharp, nanoid, dayjs, ...
    │   ├── src/
    │   │   ├── api/                # api Lambda entry + handler modules
    │   │   ├── renderer/           # renderer Lambda entry + Dockerfile
    │   │   └── image-resizer/      # image-resizer entry + Dockerfile
    │   ├── scripts/
    │   │   ├── build-api.sh        # esbuild → dist/api.zip
    │   │   ├── build-renderer.sh   # docker build
    │   │   ├── build-image-resizer.sh
    │   │   └── ecr-push.sh         # tag :latest + :<git sha>, push
    │   └── eslint.config.js
    ├── shared/                     # no package.json — imported via relative path
    │   ├── renderer.js             # Handlebars + markdown + template loader
    │   ├── schema/
    │   │   └── resume.schema.json
    │   └── section-types.js
    ├── templates/                  # no package.json
    │   ├── monaco/
    │   │   ├── template.hbs
    │   │   ├── style.css
    │   │   ├── meta.json
    │   │   └── preview.png
    │   └── modern/
    └── infrastructure/             # terraform only
        ├── *.tf
        └── README.md               # manual step: update platform.idp.app-clients SSM
```

## npm scripts

### Root `package.json`

```json
{
  "name": "visual-resumes",
  "private": true,
  "scripts": {
    "frontend:dev": "yarn --cwd packages/editor dev",
    "frontend:build": "yarn --cwd packages/editor build",
    "frontend:deploy": "yarn --cwd packages/editor deploy",

    "backend:build": "yarn --cwd packages/functions build",
    "backend:deploy": "yarn backend:build && yarn --cwd packages/functions push-renderer && yarn --cwd packages/functions push-image-resizer && yarn infra:apply",

    "infra:init": "terraform -chdir=packages/infrastructure init",
    "infra:plan": "terraform -chdir=packages/infrastructure plan",
    "infra:apply": "terraform -chdir=packages/infrastructure apply -auto-approve",
    "infra:output": "terraform -chdir=packages/infrastructure output",

    "lint": "yarn --cwd packages/editor lint && yarn --cwd packages/functions lint",
    "test": "yarn --cwd packages/editor test && yarn --cwd packages/functions test",

    "deploy": "yarn backend:deploy && yarn frontend:build && yarn frontend:deploy"
  }
}
```

### Per-package scripts

**`packages/editor/package.json`:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "deploy": "scripts/deploy.sh",
    "lint": "eslint src",
    "test": "vitest run"
  }
}
```

**`packages/functions/package.json`:**
```json
{
  "scripts": {
    "build": "scripts/build-api.sh && scripts/build-renderer.sh && scripts/build-image-resizer.sh",
    "push-renderer": "scripts/ecr-push.sh visual-resumes-renderer",
    "push-image-resizer": "scripts/ecr-push.sh visual-resumes-image-resizer",
    "lint": "eslint src",
    "test": "node --test \"src/**/*.test.js\""
  }
}
```

Image-tagging strategy: `ecr-push.sh` tags images with both `:latest` and `:<git rev-parse HEAD>`. Terraform references `:${var.image_tag}` (defaulting to the current SHA at apply time) so each deploy forces a Lambda update.

## Observability, testing, local dev

- CloudWatch logs per Lambda (7-day retention, module default).
- No X-Ray or custom metrics in v2.0.
- Tests: `node --test` for `functions` (handler unit tests with `aws-sdk-client-mock`), `vitest` for `editor`. No end-to-end browser tests in v2.0.
- Local dev: `yarn frontend:dev` runs Vite against a deployed dev API Gateway (`.env.development` points at it). Renderer locally: `node src/renderer/local-render.js` produces HTML only (no PDF — Chromium requires container build).

## Single env for v2.0

One deployed environment at `visual-resumes.isnan.eu`. Adding a dev environment later means Terraform workspaces or a `dev/` overlay (deferred).

## Prerequisites (external changes landed before this project's first apply)

1. **Export from `platform/idp`** — add SSM parameters `/platform/idp/user-pool-id` and `/platform/idp/issuer` (one-time change to the `platform/idp` repo) so this project can discover them via `data "aws_ssm_parameter"`.
2. **Ship `lambda-trigger-apigw` module change** — breaking rewrite (single Lambda → map of integrations) to `terraform-modules`. Migrate the existing `cardgames-score` consumer at the same time.
3. **Manual `platform.idp.app-clients` update** — after first `terraform apply` here, append `"resumes": <new-client-id>` to the `platform.idp.app-clients` SSM parameter in the `platform/idp` repo. Document the step in `packages/infrastructure/README.md`.
