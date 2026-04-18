# Plan 4 — `image-resizer` Lambda

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `packages/functions/image-resizer` hello-world stub with a real handler that generates a 400×400 JPEG thumbnail for every photo uploaded under `users/*/photos/*.{jpg,jpeg,png,webp}`. The thumbnail is used solely by the editor preview pane; publish-time re-encoding is Plan 5's concern.

**Architecture:** Container Lambda. esbuild bundles `src/` → `bin/` with `sharp` and `@aws-sdk/*` externalized; the Dockerfile installs `sharp` fresh against Linux/x86_64 at build time (guarantees the correct native binary regardless of the developer's OS). Handler is triggered by S3 `ObjectCreated:*` events filtered to `.jpg|.jpeg|.png|.webp` under `users/` (configured in Plan 1). A guard skips any key containing `-thumb.` to prevent infinite recursion when we write the thumbnail back into the same bucket.

**Tech Stack:** Node.js 22 (ESM), `sharp`, `@aws-sdk/client-s3`, esbuild, Docker (linux/amd64), `node --test`.

**Repo this plan runs in:** `visual-resumes`.

**Prerequisites:**
- Plan 1 through Task 17 (infra deployed, image-resizer stub container already in ECR and wired to S3 via the notification filters in `s3-triggers.tf`).
- Plan 2 complete (`packages/functions/package.json` + yarn.lock exist).
- Plan 3 **not strictly required**, but it already added `esbuild` to `packages/functions/package.json` — if Plan 3 was skipped, add it here.

---

## File structure (what this plan creates or modifies)

```
packages/functions/
├── package.json                             # MODIFIED — add sharp + (if not yet) esbuild
└── image-resizer/
    ├── src/
    │   ├── index.js                         # entry (replaces stub)
    │   ├── resize.js                        # pure sharp pipeline
    │   ├── resize.test.js
    │   ├── index.test.js
    │   └── fixtures/
    │       └── test-600x400.jpg             # test fixture (~30 KB)
    ├── bin/                                 # esbuild output (gitignored)
    ├── package.runtime.json                 # minimal deps installed inside the container
    ├── Dockerfile                           # REPLACED — multi-stage build with sharp install
    └── scripts/
        ├── build.sh                         # REPLACED — esbuild + docker build
        └── push.sh                          # unchanged from Plan 1
```

---

### Task 1: Add `sharp` dependency

**Files:**
- Modify: `packages/functions/package.json`
- Modify: `packages/functions/yarn.lock`

- [ ] **Step 1: Add deps**

Inside `packages/functions/`:

```bash
yarn add --exact sharp@0.33.5
```

If Plan 3 was skipped and `esbuild` isn't installed yet, also run:

```bash
yarn add --dev --exact esbuild@0.24.2
```

- [ ] **Step 2: Commit**

```bash
git add packages/functions/package.json packages/functions/yarn.lock
git commit -m "feat(functions): add sharp dependency for image-resizer"
```

---

### Task 2: Test fixture — a tiny sample JPEG

**Files:**
- Create: `packages/functions/image-resizer/src/fixtures/test-600x400.jpg`

- [ ] **Step 1: Generate a 600×400 JPEG using sharp**

Run from the repo root:

```bash
node -e "
  import('sharp').then(async ({default: sharp}) => {
    const buf = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 180, g: 40, b: 90 } }
    }).jpeg({ quality: 85 }).toBuffer();
    require('fs').writeFileSync('packages/functions/image-resizer/src/fixtures/test-600x400.jpg', buf);
    console.log('wrote', buf.length, 'bytes');
  });
" --input-type=commonjs
```

Expected: a JPEG of a few KB exists at the target path.

- [ ] **Step 2: Commit the fixture**

```bash
git add packages/functions/image-resizer/src/fixtures/test-600x400.jpg
git commit -m "test(image-resizer): sample 600x400 JPEG fixture"
```

---

### Task 3: `src/resize.js` — pure pipeline (TDD)

**Files:**
- Create: `packages/functions/image-resizer/src/resize.test.js`
- Create: `packages/functions/image-resizer/src/resize.js`

- [ ] **Step 1: Failing test**

```javascript
// packages/functions/image-resizer/src/resize.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { makeThumbnail, thumbnailKeyFor } from './resize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = fs.readFileSync(path.join(here, 'fixtures', 'test-600x400.jpg'));

describe('resize', () => {
  describe('thumbnailKeyFor', () => {
    it('replaces the extension with -thumb.jpg and preserves the prefix', () => {
      assert.equal(thumbnailKeyFor('users/U1/photos/R1.jpg'),  'users/U1/photos/R1-thumb.jpg');
      assert.equal(thumbnailKeyFor('users/U1/photos/R1.jpeg'), 'users/U1/photos/R1-thumb.jpg');
      assert.equal(thumbnailKeyFor('users/U1/photos/R1.png'),  'users/U1/photos/R1-thumb.jpg');
      assert.equal(thumbnailKeyFor('users/U1/photos/R1.webp'), 'users/U1/photos/R1-thumb.jpg');
    });

    it('throws on unsupported extensions', () => {
      assert.throws(() => thumbnailKeyFor('users/U1/photos/R1.gif'), /unsupported/);
    });
  });

  describe('makeThumbnail', () => {
    it('produces a 400x400 JPEG (cover crop, quality 85)', async () => {
      const out = await makeThumbnail(sample);
      const meta = await sharp(out).metadata();
      assert.equal(meta.format, 'jpeg');
      assert.equal(meta.width, 400);
      assert.equal(meta.height, 400);
      // Reasonable size bounds for a flat-color 400x400 JPEG q85.
      assert.ok(out.length > 1000 && out.length < 80_000, `unexpected size ${out.length}`);
    });

    it('fails fast on invalid bytes', async () => {
      await assert.rejects(() => makeThumbnail(Buffer.from('not an image')));
    });
  });
});
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `cd packages/functions && yarn test`

- [ ] **Step 3: Implement `resize.js`**

```javascript
// packages/functions/image-resizer/src/resize.js
import sharp from 'sharp';

const SUPPORTED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

export const thumbnailKeyFor = (sourceKey) => {
  const lower = sourceKey.toLowerCase();
  const ext = SUPPORTED_EXT.find((e) => lower.endsWith(e));
  if (!ext) throw new Error(`unsupported extension for key: ${sourceKey}`);
  // Strip the matched extension (case-insensitive) and append -thumb.jpg
  return sourceKey.slice(0, sourceKey.length - ext.length) + '-thumb.jpg';
};

export const makeThumbnail = async (inputBuffer) =>
  sharp(inputBuffer)
    .rotate()                   // honor EXIF orientation
    .resize(400, 400, { fit: 'cover' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add packages/functions/image-resizer/src/resize.js packages/functions/image-resizer/src/resize.test.js
git commit -m "feat(image-resizer): sharp pipeline (resize + rotate + jpeg q85)"
```

---

### Task 4: `src/index.js` — handler (TDD)

**Files:**
- Modify (replace stub): `packages/functions/image-resizer/src/index.js`
- Create: `packages/functions/image-resizer/src/index.test.js`

- [ ] **Step 1: Failing test**

```javascript
// packages/functions/image-resizer/src/index.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { handler } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = fs.readFileSync(path.join(here, 'fixtures', 'test-600x400.jpg'));

const s3 = mockClient(S3Client);
beforeEach(() => { s3.reset(); });

const evt = (key, bucket = 'visual-resumes-storage') => ({
  Records: [{
    eventName: 'ObjectCreated:Put',
    s3: { bucket: { name: bucket }, object: { key } },
  }],
});

const bodyOf = (buf) => ({
  transformToByteArray: async () => new Uint8Array(buf),
});

describe('image-resizer handler', () => {
  it('creates a 400x400 -thumb.jpg next to the source', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(sample), ContentType: 'image/jpeg' });
    s3.on(PutObjectCommand).resolves({});

    await handler(evt('users/U1/photos/R1.jpg'));

    const puts = s3.commandCalls(PutObjectCommand);
    assert.equal(puts.length, 1);
    const input = puts[0].args[0].input;
    assert.equal(input.Bucket, 'visual-resumes-storage');
    assert.equal(input.Key, 'users/U1/photos/R1-thumb.jpg');
    assert.equal(input.ContentType, 'image/jpeg');

    const meta = await sharp(input.Body).metadata();
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 400);
  });

  it('skips keys already ending in -thumb.jpg (prevents recursion)', async () => {
    await handler(evt('users/U1/photos/R1-thumb.jpg'));
    assert.equal(s3.commandCalls(GetObjectCommand).length, 0);
    assert.equal(s3.commandCalls(PutObjectCommand).length, 0);
  });

  it('skips unsupported extensions without crashing', async () => {
    await handler(evt('users/U1/photos/R1.tiff'));
    assert.equal(s3.commandCalls(GetObjectCommand).length, 0);
  });

  it('skips malformed images without crashing the invocation', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(Buffer.from('not an image')), ContentType: 'image/jpeg' });
    await handler(evt('users/U1/photos/R1.jpg'));
    // Did NOT attempt a PUT.
    assert.equal(s3.commandCalls(PutObjectCommand).length, 0);
  });

  it('handles multiple Records in one event', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(sample), ContentType: 'image/jpeg' });
    s3.on(PutObjectCommand).resolves({});

    await handler({
      Records: [
        { eventName: 'ObjectCreated:Put', s3: { bucket: { name: 'visual-resumes-storage' }, object: { key: 'users/U1/photos/R1.jpg' } } },
        { eventName: 'ObjectCreated:Put', s3: { bucket: { name: 'visual-resumes-storage' }, object: { key: 'users/U2/photos/R9.png' } } },
      ],
    });

    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key).sort();
    assert.deepEqual(puts, ['users/U1/photos/R1-thumb.jpg', 'users/U2/photos/R9-thumb.jpg']);
  });

  it('URL-decodes S3 keys (S3 delivers percent-encoded keys)', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(sample), ContentType: 'image/jpeg' });
    s3.on(PutObjectCommand).resolves({});

    await handler(evt('users/U%201/photos/R%20X.jpg'));

    const get = s3.commandCalls(GetObjectCommand)[0].args[0].input;
    assert.equal(get.Key, 'users/U 1/photos/R X.jpg');
    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    assert.equal(put.Key, 'users/U 1/photos/R X-thumb.jpg');
  });
});
```

- [ ] **Step 2: Run — fails (current `src/index.js` is the stub)**

- [ ] **Step 3: Replace the stub `src/index.js`**

```javascript
// packages/functions/image-resizer/src/index.js
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { makeThumbnail, thumbnailKeyFor } from './resize.js';

const s3 = new S3Client({});

const SUPPORTED_SUFFIXES = ['.jpg', '.jpeg', '.png', '.webp'];

const isCandidate = (key) => {
  const lower = key.toLowerCase();
  if (lower.includes('-thumb.')) return false;              // prevent recursion
  return SUPPORTED_SUFFIXES.some((s) => lower.endsWith(s));
};

const processRecord = async (record) => {
  const bucket = record.s3?.bucket?.name;
  const keyRaw = record.s3?.object?.key;
  if (!bucket || !keyRaw) {
    console.warn('image-resizer: malformed record, skipping', JSON.stringify(record));
    return;
  }
  const key = decodeURIComponent(keyRaw.replace(/\+/g, ' '));

  if (!isCandidate(key)) {
    console.log(`image-resizer: skip ${key}`);
    return;
  }

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buf = Buffer.from(await obj.Body.transformToByteArray());
    const thumb = await makeThumbnail(buf);
    const thumbKey = thumbnailKeyFor(key);

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: thumbKey,
      Body: thumb,
      ContentType: 'image/jpeg',
      CacheControl: 'private, max-age=3600',
    }));

    console.log(`image-resizer: wrote ${thumbKey} (${thumb.length} bytes)`);
  } catch (err) {
    // Swallow per-record errors: the trigger is best-effort, we don't want to retry-storm on bad images.
    console.error(`image-resizer: failed for ${key}:`, err?.message ?? err);
  }
};

export const handler = async (event) => {
  const records = event?.Records ?? [];
  for (const record of records) {
    await processRecord(record);
  }
  return { ok: true, processed: records.length };
};
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Lint**

Run: `cd packages/functions && yarn lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/functions/image-resizer/src/index.js packages/functions/image-resizer/src/index.test.js
git commit -m "feat(image-resizer): handler — S3 event → sharp thumbnail"
```

---

### Task 5: Runtime `package.json` + real Dockerfile

**Files:**
- Create: `packages/functions/image-resizer/package.runtime.json`
- Modify (replace stub): `packages/functions/image-resizer/Dockerfile`

- [ ] **Step 1: `package.runtime.json`** — installed fresh inside the container so sharp gets Linux/x86_64 binaries

```json
{
  "name": "image-resizer-runtime",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "sharp": "0.33.5"
  }
}
```

- [ ] **Step 2: `Dockerfile`**

```dockerfile
# Multi-stage build — stage 1 installs sharp against Linux/x86_64 so the native binary matches the runtime.
FROM public.ecr.aws/lambda/nodejs:22 AS deps
WORKDIR /build
COPY package.runtime.json package.json
RUN npm install --omit=dev --no-audit --no-fund --no-package-lock

FROM public.ecr.aws/lambda/nodejs:22
COPY --from=deps /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY bin/ ${LAMBDA_TASK_ROOT}/
CMD ["index.handler"]
```

- [ ] **Step 3: Commit**

```bash
git add packages/functions/image-resizer/package.runtime.json packages/functions/image-resizer/Dockerfile
git commit -m "feat(image-resizer): Dockerfile with fresh sharp install for linux/amd64"
```

---

### Task 6: Real `scripts/build.sh`

**Files:**
- Modify (replace stub): `packages/functions/image-resizer/scripts/build.sh`

- [ ] **Step 1: Replace with**

```bash
#!/usr/bin/env bash
# Bundle src → bin via esbuild (sharp + @aws-sdk/* externalized),
# then build the Docker image.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_ROOT="$(cd "$DIR/.." && pwd)"
TAG="${1:-latest}"

rm -rf "$DIR/bin"
mkdir -p "$DIR/bin"

"$FUNCTIONS_ROOT/node_modules/.bin/esbuild" \
  "$DIR/src/index.js" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outfile="$DIR/bin/index.js" \
  --banner:js='import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);' \
  --external:sharp \
  --external:@aws-sdk/* \
  --legal-comments=none

cat > "$DIR/bin/package.json" <<'EOF'
{ "type": "module" }
EOF

docker build --platform linux/amd64 -t "visual-resumes-image-resizer:$TAG" "$DIR"
echo "built image visual-resumes-image-resizer:$TAG"
```

- [ ] **Step 2: Smoke-build locally**

Run: `packages/functions/image-resizer/scripts/build.sh latest`
Expected: image built. The Docker build step fetches a fresh Linux sharp binary in the `deps` stage.

- [ ] **Step 3: Commit**

```bash
git add packages/functions/image-resizer/scripts/build.sh
git commit -m "feat(image-resizer): esbuild + docker build script"
```

---

### Task 7: Push + deploy

**Files:** none (operational).

- [ ] **Step 1: Push image**

Run:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo eu-central-1)

packages/functions/image-resizer/scripts/build.sh   "$(git rev-parse HEAD)"
packages/functions/image-resizer/scripts/push.sh    "$ACCOUNT_ID" "$REGION" "$(git rev-parse HEAD)"
```

Expected: new tag in ECR.

- [ ] **Step 2: Bump `image_tag` for Terraform**

Either pass `-var="image_tag=$(git rev-parse HEAD)"` to `terraform apply`, OR set `TF_VAR_image_tag` in the environment, OR edit `packages/infrastructure/variables.tf`'s default. For a one-off apply:

```bash
cd packages/infrastructure
terraform apply -var="image_tag=$(git rev-parse HEAD)" -auto-approve
```

Expected: only `module.image_resizer.aws_lambda_function.this` updates.

- [ ] **Step 3: Live smoke test**

Upload a test JPEG via the aws CLI under a fake user:

```bash
STORAGE=$(terraform -chdir=packages/infrastructure output -raw storage_bucket)
aws s3 cp packages/functions/image-resizer/src/fixtures/test-600x400.jpg \
  "s3://$STORAGE/users/TESTUSER/photos/SMOKE.jpg"

# Wait ~2s for the event to fire, then list:
sleep 3
aws s3 ls "s3://$STORAGE/users/TESTUSER/photos/"
```

Expected: both `SMOKE.jpg` and `SMOKE-thumb.jpg` are present.

- [ ] **Step 4: Check the thumbnail dimensions**

```bash
aws s3 cp "s3://$STORAGE/users/TESTUSER/photos/SMOKE-thumb.jpg" /tmp/thumb.jpg
node -e "import('sharp').then(s=>s.default('/tmp/thumb.jpg').metadata().then(console.log))"
```

Expected: `width: 400, height: 400, format: 'jpeg'`.

- [ ] **Step 5: Cleanup test fixtures**

```bash
aws s3 rm "s3://$STORAGE/users/TESTUSER/photos/SMOKE.jpg"
aws s3 rm "s3://$STORAGE/users/TESTUSER/photos/SMOKE-thumb.jpg"
```

---

### Task 8: Self-review

**Files:** none.

- [ ] **Step 1: Spec coverage**
- [ ] Fires on `users/*/photos/*.{jpg,jpeg,png,webp}` only (controlled by S3 notification filters in Plan 1).
- [ ] Output: 400×400 JPEG q85 at `-thumb.jpg`.
- [ ] Does NOT process `-thumb.jpg` (recursion guard).
- [ ] Tolerant of malformed input (logs + swallows — matches "no retry storm" expectation).
- [ ] URL-decodes S3 keys.
- [ ] Handles multi-record events.

- [ ] **Step 2: Known trade-offs**
- Sharp native binary is installed fresh in the container for linux/amd64 — slightly slower builds, but no cross-platform surprises.
- No DLQ; per-record errors are logged and continue. Accept for 5-user scale.

---

## Self-review checklist

- [ ] `yarn test` green (unit + integration handler tests).
- [ ] `yarn lint` clean.
- [ ] Image size under 300 MB (sharp's native deps are ~30 MB).
- [ ] Live smoke test produced a 400×400 `-thumb.jpg`.
- [ ] Invocation on an already-`-thumb.jpg` key is a no-op (confirmed in unit test).

## Out of scope

- Validation of max-size or content-type at upload time (the presigned URL in Plan 3 enforces 5 MB + allowed content types at the API layer).
- Publishing photo re-encoding (Plan 5 — renderer Lambda does its own re-encode with different dimensions/quality for the public artifact).
