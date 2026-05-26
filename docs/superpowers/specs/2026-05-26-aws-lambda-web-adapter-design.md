# AWS Lambda Web Adapter — design

**Date:** 2026-05-26
**Scope:** `packages/functions/api` (zip) and `packages/functions/renderer` (Docker)
**Out of scope:** `packages/functions/image-resizer` (S3-triggered, no HTTP), API Gateway, IAM, CloudFront, editor SPA

## Goal

Replace hand-rolled `event.routeKey` dispatch and per-Lambda error-mapping helpers with a [Hono](https://hono.dev) app fronted by [AWS Lambda Web Adapter (LWA)](https://github.com/aws/aws-lambda-web-adapter). Driver: reduce boilerplate. Non-goals: local-dev parity, framework portability, behavior changes.

API Gateway HTTP API v2 stays in front of both Lambdas, with the existing Cognito JWT authorizer. LWA forwards the original API GW event's `requestContext` to Hono via the `x-amzn-request-context` header; middleware parses it and extracts JWT claims.

## Stack decisions

| Decision | Choice | Rationale |
|---|---|---|
| Lambdas converted | `api` + `renderer` | Both serve HTTP. `image-resizer` is S3-triggered. |
| HTTP framework | Hono + `@hono/node-server` | Smallest cold-start hit, ESM-native, fits esbuild bundle. |
| Packaging — `api` | zip + AWS-published LWA layer (arm64, v27, eu-central-1) | No additional infra moving parts; layer is the documented Node.js pattern. |
| Packaging — `renderer` | Docker + LWA binary copied in | Already Docker for Chromium; LWA binary added via `COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter`. |
| Lambda runtime — `api` | `nodejs22.x` (managed) + `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap` | `provided.al2023` would need a bundled Node binary (~80MB). |
| API frontend | Keep API Gateway HTTP API v2 + Cognito JWT authorizer | Preserves free claim verification; LWA passes claims through. |
| Code sharing | None — each Lambda copies its own `middleware.js` | Zero coupling, ~50 lines of duplication. |
| Dependency placement | `hono` + `@hono/node-server` in `packages/functions/package.json` only | Both are pure JS — esbuild inlines them into each Lambda's `bin/index.js`. `renderer/package.runtime.json` unchanged. |

## Architecture

### `api` Lambda

**Source layout (`packages/functions/api/src/`):**
```
src/
├── server.js                # boot @hono/node-server on PORT (entry for esbuild)
├── app.js                   # build Hono app: middleware + route wiring
├── middleware.js            # requestContext, requireUser, onError
├── routes/                  # existing files, refactored to (c) => … handlers
└── lib/
    ├── ids.js               # unchanged
    ├── storage-private.js   # unchanged
    ├── storage-published.js # unchanged
    └── validation.js        # unchanged
```

**Deleted from current code:**
- `src/index.js` (routeKey dispatch → `app.js`)
- `src/lib/http.js` + `src/lib/http.test.js` (helpers → `c.json()`)
- `src/lib/auth.js` + `src/lib/auth.test.js` (`MissingClaimError` + `extractClaims` → middleware)

**Bundle contents (`bin/`):**
```
bin/
├── index.js       # esbuild output (entry: src/server.js, externals: @aws-sdk/*)
├── run.sh         # executable: #!/bin/sh\nexec node index.js
└── package.json   # { "type": "module" }
```

**Build script (`packages/functions/api/scripts/build.sh`):** unchanged structure, two edits — esbuild entry switches from `src/index.js` to `src/server.js`, and a `run.sh` is written into `bin/` (chmod +x) before zipping.

### `renderer` Lambda

**Source layout (`packages/functions/renderer/src/`):**
```
src/
├── server.js          # boot @hono/node-server on PORT (entry for esbuild)
├── app.js             # Hono app with POST /api/resumes/:id/publish
├── middleware.js      # copy of api's middleware, onError tailored to publish errors
├── publish.js         # unchanged
├── browser.js         # unchanged
├── published-keys.js  # unchanged
└── slug.js            # unchanged
```

**Deleted from current code:**
- `src/index.js` (handler + extractUser + response/error helpers → `app.js` + middleware)
- `src/index.test.js` → replaced by `src/app.test.js` covering the same cases via `app.request()`

**Dockerfile changes (3 additions, 1 edit):**
```dockerfile
# ...stage 1 (deps + chromium pack) unchanged...

FROM public.ecr.aws/lambda/nodejs:22

# AWS Lambda Web Adapter — release notes:
# https://github.com/aws/aws-lambda-web-adapter/releases
ARG LWA_VERSION=1.0.0
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:${LWA_VERSION} /lambda-adapter /opt/extensions/lambda-adapter

COPY --from=deps /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=deps /opt/chromium /opt/chromium
COPY bin/ ${LAMBDA_TASK_ROOT}/
ENV TEMPLATES_DIR=${LAMBDA_TASK_ROOT}/templates
ENV CHROMIUM_PACK_DIR=/opt/chromium

# was: CMD ["index.handler"]
CMD ["node", "index.js"]
```

`renderer/scripts/build.sh`: esbuild entry switches from `src/index.js` to `src/server.js`. Externals (`puppeteer-core`, `@sparticuz/chromium-min`, `@aws-sdk/*`) unchanged.

## Middleware (copied into both Lambdas)

`middleware.js` exports three functions. The `api` and `renderer` copies are byte-identical except for `onError` (each maps its own error names).

**`api/src/middleware.js`:**
```js
// LWA forwards the API Gateway event's requestContext as a JSON-encoded header.
// Parse once and stash claims on the Hono context for downstream handlers.
export const requestContext = async (c, next) => {
  const raw = c.req.header('x-amzn-request-context');
  if (raw) {
    try {
      const ctx = JSON.parse(raw);
      c.set('claims', ctx?.authorizer?.jwt?.claims ?? null);
    } catch { /* malformed — auth middleware will 401 */ }
  }
  await next();
};

// custom:Id is the per-user partition key for resumes; everything 401s without it.
export const requireUser = async (c, next) => {
  const claims = c.get('claims');
  if (!claims?.['custom:Id']) {
    return c.json({ error: 'Unauthorized', message: 'missing custom:Id claim' }, 401);
  }
  c.set('customId', claims['custom:Id']);
  await next();
};

// Mirror of current api/src/index.js catch block.
export const onError = (err, c) => {
  if (err?.code === 'InvalidJSON') return c.json({ error: 'BadRequest', message: err.message }, 400);
  console.error('unhandled error', err);
  return c.json({ error: 'InternalError', message: 'unexpected error' }, 500);
};
```

**`renderer/src/middleware.js`** — `requestContext` and `requireUser` identical; `onError` differs:
```js
export const onError = (err, c) => {
  if (err?.name === 'NotFound')  return c.json({ error: 'NotFound',  message: err.message }, 404);
  if (err?.name === 'Forbidden') return c.json({ error: 'Forbidden', message: err.message }, 403);
  console.error('renderer unhandled error', err);
  return c.json({ error: 'InternalError', message: 'publish failed' }, 500);
};
```

## App wiring

Same shape in both Lambdas:

```js
// app.js
import { Hono } from 'hono';
import { requestContext, requireUser, onError } from './middleware.js';

const app = new Hono();
app.use('*', requestContext);
app.use('/api/*', requireUser);
app.onError(onError);

// route registrations follow...
export { app };
```

```js
// server.js (identical in both)
import { serve } from '@hono/node-server';
import { app } from './app.js';
serve({ fetch: app.fetch, port: Number(process.env.PORT) || 8080 });
```

**`renderer/src/app.js`** has the single publish route:
```js
app.post('/api/resumes/:id/publish', async (c) => {
  const { customId } = c.get('claims');
  const out = await publish({
    customId,
    resumeId: c.req.param('id'),
    templatesDir:     env('TEMPLATES_DIR'),
    storageBucket:    env('RESUMES_STORAGE_BUCKET'),
    publishedBucket:  env('RESUMES_PUBLISHED_BUCKET'),
    cloudfrontDistId: env('CLOUDFRONT_DIST_ID'),
    htmlToPdf:        await loadHtmlToPdf(),  // existing lazy-import pattern preserved
  });
  if (out.etag) c.header('etag', out.etag);
  return c.json(out);
});
```

## Infrastructure

All changes are inside `packages/infrastructure/functions.tf`. API Gateway module is unchanged.

```hcl
# NEW — top of file
locals {
  # AWS Lambda Web Adapter (arm64) — release notes:
  # https://github.com/aws/aws-lambda-web-adapter/releases
  lwa_layer_version = 27
  lwa_layer_arn     = "arn:aws:lambda:${var.region}:753240598075:layer:LambdaAdapterLayerArm64:${local.lwa_layer_version}"
}

module "api" {
  # ...source/function_name/architecture/memory/timeout unchanged...
  layers = [local.lwa_layer_arn]

  zip = {
    filename = "${path.module}/../functions/api/dist/api.zip"
    runtime  = "nodejs22.x"
    handler  = "run.sh"                                                            # was "index.handler"
    hash     = filebase64sha256("${path.module}/../functions/api/bin/index.js")    # unchanged target
  }

  environment_variables = {
    # existing 3 vars +
    AWS_LAMBDA_EXEC_WRAPPER = "/opt/bootstrap"
    PORT                    = "8080"
    AWS_LWA_INVOKE_MODE     = "buffered"
  }
}

module "renderer" {
  # ...source/image/architecture/memory/timeout unchanged...
  environment_variables = {
    # existing 3 vars +
    AWS_LWA_INVOKE_MODE = "buffered"
    PORT                = "8080"
  }
}
```

**Cold-start note:** LWA adds ~50–100ms on cold start (extension boot + Hono `serve()` listening). Current `api` timeout 10s and `renderer` timeout 60s have ample headroom. No timeout bumps.

## Tests

Tests stay in `node --test` with the same file layout, exercising the Hono app via `app.request()`. The `test` npm script is unchanged.

**Pattern per route test:**
```js
import { app } from '../src/app.js';

const callWithUser = (path, init = {}, customId = 'u1') =>
  app.request(path, {
    ...init,
    headers: {
      'x-amzn-request-context': JSON.stringify({
        authorizer: { jwt: { claims: { 'custom:Id': customId } } },
      }),
      ...init.headers,
    },
  });

test('POST /api/resumes creates a resume', async () => {
  s3Mock.on(PutObjectCommand).resolves({});  // unchanged
  const res = await callWithUser('/api/resumes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Jane' }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);
});
```

**Per route test file (~5 line changes):** import `{ app }` instead of the route function; build via the helper instead of a fake event; read `res.status` / `await res.json()` instead of `result.statusCode` / `JSON.parse(result.body)`.

**Unchanged:**
- All `lib/storage-*.test.js`, `lib/validation.test.js`, `lib/ids.test.js` (below the HTTP layer)
- `renderer/src/publish.test.js`, `published-keys.test.js`, `slug.test.js`
- `aws-sdk-client-mock` setups

**Deleted alongside their source files:** `api/src/lib/http.test.js`, `api/src/lib/auth.test.js`, `renderer/src/index.test.js`.

## Migration sequencing

1. **Deps + middleware skeleton** — add `hono` + `@hono/node-server` to `packages/functions/package.json`; create `api/src/middleware.js` and `renderer/src/middleware.js`.
2. **api refactor** — add `app.js` + `server.js`; convert each route in `routes/*.js` from `(event) => {…}` to `(c) => {…}`; delete `lib/http.js`, `lib/auth.js`, and their tests; migrate route test files to `app.request()`; update `scripts/build.sh` (entry → `server.js`, emit `run.sh`).
3. **renderer refactor** — `app.js` + `server.js`; route delegates to `publish.js` unchanged; replace `index.js`/`index.test.js` with `app.js`/`app.test.js`; update `scripts/build.sh` (entry → `server.js`); update `Dockerfile` (`ARG LWA_VERSION`, `COPY --from=…`, `CMD ["node", "index.js"]`).
4. **Infra** — `packages/infrastructure/functions.tf`: add `locals.lwa_layer_arn`, `layers = [...]`, env vars on both Lambdas, switch api's `handler` to `run.sh`.
5. **Local verify** — `yarn lint && yarn test` green.
6. **Deploy** — `yarn backend:deploy` (builds all three Lambdas, pushes renderer + image-resizer images, runs `terraform apply -auto-approve`). Plan diff: api zip hash + new `layers` + 3 env vars + handler change; renderer ECR digest + 2 env vars.
7. **Smoke-test** each endpoint through CloudFront (list/create/get/put/delete/photo/revoke/publish); verify `etag` on PUT and publish responses.

## Rollback

`git revert` the commits, `yarn backend:deploy`. No data migrations, no API-shape changes — fully transparent to the editor SPA.

## Risk areas worth a live check after deploy

- POST with empty body — `c.req.json()` parses differently from manual `JSON.parse(event.body)`; tests cover but worth a live curl.
- Long-running publish — `AWS_LWA_INVOKE_MODE=buffered` means responses buffer fully before returning (no streaming). Fine for our JSON responses, but worth confirming the publish round-trip under realistic Chromium load.
- `etag` response header — verify `c.header('etag', …)` surfaces in the CloudFront response so the editor's autosave doesn't 412.
