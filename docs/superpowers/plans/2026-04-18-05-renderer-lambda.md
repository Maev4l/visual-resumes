# Plan 5 — `renderer` Lambda

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `packages/functions/renderer` hello-world stub with a real handler wired to `POST /api/resumes/{id}/publish`. The handler reads the resume JSON, reads the already-resized WebP photo (if any) and inlines it into the HTML as a base64 data URI, renders HTML via the shared renderer, generates a PDF via headless Chromium, uploads the two artifacts (html + pdf) to the published bucket, writes `published: { slug, publishedAt }` back onto the resume JSON, and issues a CloudFront invalidation. Returns `{ slug, hasPhoto }` to the editor.

**Architecture:** Container Lambda on arm64 (Graviton). The shared `packages/shared/renderer.node.js` loads templates from disk; templates are copied into the image at build time (under `/var/task/templates`). PDF generation uses `puppeteer-core` + `@sparticuz/chromium-min` (the `-min` variant ships no binary — the npm `@sparticuz/chromium` package is x86_64-only, so for arm64 we use `-min` and curl the arm64 pack from GitHub releases during `docker build`, extracting it to `/opt/chromium/`). No photo re-encoding at publish time — the image-resizer Lambda already produced a 600px WebP at `users/<customId>/photos/<resumeId>.webp`, the renderer just base64-encodes it into the HTML. Slug is 12-char nanoid with alphabet `0123456789a-z`; first publish uses `IfNoneMatch: '*'` with up to 5 retries to guard against collisions, republish overwrites unconditionally. Writes back to the resume JSON use conditional S3 writes so a concurrent save from the editor doesn't get clobbered.

**Tech Stack:** Node.js 22 (ESM), `puppeteer-core`, `@sparticuz/chromium-min` (arm64 pack downloaded at Dockerfile build time), `nanoid`, `@aws-sdk/client-s3`, `@aws-sdk/client-cloudfront`, esbuild, Docker (**linux/arm64** with `--provenance=false --sbom=false`), `node --test` with handcrafted browser stubs. **No sharp** — the image-resizer Lambda already produced the WebP the renderer needs.

**Repo this plan runs in:** `visual-resumes`.

**Prerequisites:**
- Plans 1, 2, 3, 4 applied. In particular:
  - Plan 1 wired `module.renderer` + the `POST /api/resumes/{id}/publish` route via `lambda-trigger-apigw`.
  - Plan 2 shipped `packages/shared/renderer.node.js` + `packages/templates/{monaco,modern}`.
  - Plan 3 added esbuild + aws-sdk-client-mock to `packages/functions/package.json`.
  - Plan 4 produces `users/<customId>/photos/<resumeId>.webp` via image-resizer. The renderer only READS those.

---

## File structure (what this plan creates or modifies)

```
packages/functions/
├── package.json                             # MODIFIED — add puppeteer-core, @sparticuz/chromium, nanoid
└── renderer/
    ├── src/
    │   ├── index.js                         # entry (replaces stub)
    │   ├── publish.js                       # orchestrator
    │   ├── browser.js                       # chromium launcher (DI seam for tests)
    │   ├── slug.js                          # nanoid wrapper with custom alphabet
    │   ├── published-keys.js                # slug → S3 key map (html + pdf)
    │   ├── local-render.js                  # dev-only: HTML to stdout, no PDF
    │   ├── *.test.js                        # co-located unit tests
    │   └── index.test.js
    ├── bin/                                 # esbuild output + templates copy (gitignored)
    ├── package.runtime.json                 # deps installed in container
    ├── Dockerfile                           # REPLACED — multi-stage with chromium bundle
    └── scripts/
        ├── build.sh                         # REPLACED — esbuild + templates copy + docker build
        └── push.sh                          # unchanged from Plan 1
```

---

### Task 1: Add runtime dependencies

**Files:**
- Modify: `packages/functions/package.json`

- [ ] **Step 1: Add deps**

Inside `packages/functions/`:

```bash
yarn add --exact \
  puppeteer-core@24.10.0 \
  @sparticuz/chromium-min@137.0.1
# nanoid was added in Plan 2.
```

Pin rationale: `@sparticuz/chromium-min@137.0.1` (the `-min` variant ships no binary — the regular `@sparticuz/chromium` npm package is x86_64-only; for arm64 we download the pack from GitHub releases during Docker build). `puppeteer-core@24.10.0` is the release that rolled Chromium to 137. Bump in lockstep with any future chromium-min version.

- [ ] **Step 2: Commit**

```bash
git add packages/functions/package.json packages/functions/yarn.lock
git commit -m "feat(functions): add puppeteer-core + sparticuz chromium for renderer"
```

---

### Task 2: `src/slug.js` — 12-char slug generator (TDD)

**Files:**
- Create: `packages/functions/renderer/src/slug.test.js`
- Create: `packages/functions/renderer/src/slug.js`

- [ ] **Step 1: Failing test**

```javascript
// packages/functions/renderer/src/slug.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newSlug, SLUG_ALPHABET, SLUG_LENGTH } from './slug.js';

describe('slug', () => {
  it('length is 12, alphabet is 0-9a-z', () => {
    assert.equal(SLUG_LENGTH, 12);
    assert.equal(SLUG_ALPHABET, '0123456789abcdefghijklmnopqrstuvwxyz');
  });

  it('generates 12 chars from the alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const s = newSlug();
      assert.equal(s.length, 12);
      assert.match(s, /^[0-9a-z]{12}$/);
    }
  });

  it('does not collide trivially', () => {
    const set = new Set();
    for (let i = 0; i < 200; i += 1) set.add(newSlug());
    assert.equal(set.size, 200);
  });
});
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement**

```javascript
// packages/functions/renderer/src/slug.js
import { customAlphabet } from 'nanoid';

export const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export const SLUG_LENGTH = 12;

const generate = customAlphabet(SLUG_ALPHABET, SLUG_LENGTH);

export const newSlug = () => generate();
```

- [ ] **Step 4: Run — pass; commit**

```bash
git add packages/functions/renderer/src/slug.js packages/functions/renderer/src/slug.test.js
git commit -m "feat(renderer): 12-char slug generator"
```

---

### Task 3: `src/published-keys.js` (TDD)

**Files:**
- Create: `packages/functions/renderer/src/published-keys.test.js`
- Create: `packages/functions/renderer/src/published-keys.js`

> Public URLs are formatted client-side by the editor (it already has `publicHost` in its runtime config). The renderer only returns a slug.

- [ ] **Step 1: Failing test**

```javascript
// packages/functions/renderer/src/published-keys.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { publishedKeys } from './published-keys.js';

describe('published-keys', () => {
  it('builds slug-based S3 keys for the two artifacts (html + pdf — photo is embedded inline)', () => {
    assert.deepEqual(publishedKeys('abc123def456'), {
      html: 'resumes/abc123def456.html',
      pdf:  'resumes/abc123def456.pdf',
    });
  });
});
```

- [ ] **Step 2: Implement**

```javascript
// packages/functions/renderer/src/published-keys.js
export const publishedKeys = (slug) => ({
  html: `resumes/${slug}.html`,
  pdf:  `resumes/${slug}.pdf`,
});
```

- [ ] **Step 3: Run — pass; commit**

```bash
git add packages/functions/renderer/src/published-keys.js packages/functions/renderer/src/published-keys.test.js
git commit -m "feat(renderer): public URL + key helpers"
```

---

### Task 4: *(deleted — no publish-time photo re-encode)*

This task previously had the renderer re-encode the original photo to JPEG at publish time. It's gone: the image-resizer Lambda now produces the only photo we need (a 600px WebP at `users/<customId>/photos/<resumeId>.webp`), and the renderer just base64-encodes it into the HTML. No `photo.js`, no `sharp` dependency in the renderer container.

---

### Task 5: `src/browser.js` — chromium launcher (DI seam)

**Files:**
- Create: `packages/functions/renderer/src/browser.js`

> No unit test here — the function is a thin wrapper. It exists as a seam so `publish.js` can be tested with a fake in-memory browser.

- [ ] **Step 1: Write**

```javascript
// packages/functions/renderer/src/browser.js
import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

let cached = null;

// Dockerfile extracts the arm64 Chromium pack to this dir at build time — chromium-min
// ships no binary so we must tell it where to find the pre-extracted Brotli files.
const CHROMIUM_PACK_DIR = process.env.CHROMIUM_PACK_DIR ?? '/opt/chromium';

/**
 * Launches a Chromium browser in Lambda. Returns `{ browser, close }`.
 * Re-uses the same browser across warm invocations to cut cold-start cost.
 * The caller is responsible for closing pages; `close()` is only used from a SIGTERM handler or tests.
 */
export const launchBrowser = async () => {
  if (cached?.browser?.isConnected?.()) return cached;

  const browser = await puppeteer.launch({
    args: [...chromium.args, '--disable-gpu', '--disable-dev-shm-usage'],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(CHROMIUM_PACK_DIR),
    headless: true,
  });
  cached = {
    browser,
    close: async () => {
      await browser.close();
      cached = null;
    },
  };
  return cached;
};

/**
 * Render an HTML string to a PDF buffer.
 * @param {string} html — complete self-contained HTML (CSS already inlined).
 * @param {'A4'|'Letter'} format
 */
export const htmlToPdf = async (html, format) => {
  const { browser } = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // `preferCSSPageSize: true` lets each template's @page rule dictate its own
    // margins. Monaco sets `@page { margin: 14mm }` for traditional print margins;
    // modern + avant set `@page { margin: 0 }` so their full-bleed horizontal bars
    // reach the page edges. A hardcoded puppeteer `margin` would override all of that.
    return await page.pdf({
      format,
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await page.close();
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/functions/renderer/src/browser.js
git commit -m "feat(renderer): chromium launcher + htmlToPdf"
```

---

### Task 6: `src/publish.js` — orchestrator (TDD)

**Files:**
- Create: `packages/functions/renderer/src/publish.test.js`
- Create: `packages/functions/renderer/src/publish.js`

- [ ] **Step 1: Failing test**

```javascript
// packages/functions/renderer/src/publish.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { publish } from './publish.js';

const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

let tmpTemplatesDir;
const here = path.dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  s3.reset(); cf.reset();

  // Build a minimal templates dir for tests (bypasses the real packages/templates).
  tmpTemplatesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-tpl-'));
  const t = path.join(tmpTemplatesDir, 'monaco');
  fs.mkdirSync(t, { recursive: true });
  fs.writeFileSync(path.join(t, 'template.hbs'),
    `<!doctype html><html><head><!-- CSS_PLACEHOLDER --></head><body><h1>{{title}}</h1></body></html>`);
  fs.writeFileSync(path.join(t, 'style.css'), `body{color:red;}`);
  fs.writeFileSync(path.join(t, 'meta.json'),
    JSON.stringify({ name: 'Monaco', description: '', supportsPhoto: true, supportedPaperSizes: ['A4'] }));
});

const bodyOf = (str) => ({ transformToString: async () => str });
const bufferBodyOf = (buf) => ({ transformToByteArray: async () => new Uint8Array(buf) });

const fakePdfFor = (html) => Buffer.from(`PDF:${html.length}`);
const fakeHtmlToPdf = async (html) => fakePdfFor(html);

const baseResume = (over = {}) => ({
  id: 'R1',
  ownerCustomId: 'U1',
  title: 'EN — Dev',
  templateId: 'monaco',
  paperSize: 'A4',
  photoKey: null,
  sections: [],
  published: null,
  ...over,
});

const runPublish = (resume, overrides = {}) =>
  publish({
    customId: 'U1',
    resumeId: 'R1',
    templatesDir: tmpTemplatesDir,
    storageBucket: 'visual-resumes-storage',
    publishedBucket: 'visual-resumes-published',
    cloudfrontDistId: 'DIST',
    htmlToPdf: fakeHtmlToPdf,
    ...overrides,
  });

describe('publish', () => {
  it('first-time publish: generates slug, writes HTML + PDF, no JPG, writes back published on the resume', async () => {
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage' })
      .callsFake(async () => ({ Body: bodyOf(JSON.stringify(baseResume())), ETag: '"old"' }));
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();

    // New slug assigned
    assert.match(out.slug, /^[0-9a-z]{12}$/);
    assert.equal(out.hasPhoto, false);

    // PutObjects: html + pdf + resume-back-write (no jpg — no photoKey)
    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    const htmlPut = puts.find((p) => p.Key === `resumes/${out.slug}.html`);
    const pdfPut  = puts.find((p) => p.Key === `resumes/${out.slug}.pdf`);
    assert.ok(htmlPut, 'html put');
    assert.ok(pdfPut, 'pdf put');
    assert.equal(htmlPut.ContentType, 'text/html; charset=utf-8');
    assert.equal(pdfPut.ContentType, 'application/pdf');

    // Resume JSON back-write (conditional with the ETag we read)
    const jsonPut = puts.find((p) => p.Key === 'users/U1/resumes/R1.json');
    assert.ok(jsonPut, 'resume json put');
    assert.equal(jsonPut.IfMatch, '"old"');
    const persisted = JSON.parse(jsonPut.Body);
    assert.equal(persisted.published.slug, out.slug);
    assert.match(persisted.published.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // CF invalidation
    assert.equal(cf.commandCalls(CreateInvalidationCommand).length, 1);
  });

  it('republish: reuses existing slug', async () => {
    const existing = baseResume({ published: { slug: 'existingsslug', publishedAt: '2026-04-01T00:00:00.000Z' } });
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage' })
      .callsFake(async () => ({ Body: bodyOf(JSON.stringify(existing)), ETag: '"e"' }));
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(out.slug, 'existingsslug');
  });

  it('embeds the photo inline as a base64 data URI when photoKey is set; does NOT write a jpg to published', async () => {
    const webpBytes = Buffer.from([0xaa, 0xbb, 0xcc]);  // any bytes — we just check passthrough
    const resume = baseResume({ photoKey: 'users/U1/photos/R1.webp' });

    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage', Key: 'users/U1/resumes/R1.json' })
      .resolves({ Body: bodyOf(JSON.stringify(resume)), ETag: '"e"' });
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage', Key: 'users/U1/photos/R1.webp' })
      .resolves({ Body: bufferBodyOf(webpBytes) });
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(out.hasPhoto, true);

    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    // No separate .jpg / .webp artifact in the published bucket.
    assert.equal(puts.find((p) => p.Key?.endsWith('.jpg') || p.Key?.endsWith('.webp')), undefined);
    // HTML body contains the data URI.
    const htmlPut = puts.find((p) => p.Key === `resumes/${out.slug}.html`);
    const expected = `data:image/webp;base64,${webpBytes.toString('base64')}`;
    assert.ok(htmlPut.Body.includes(expected), 'HTML should inline the photo as a data URI');
  });

  it('tolerates a missing photo on republish — HTML still renders, just without the photo', async () => {
    const resume = baseResume({ photoKey: 'users/U1/photos/R1.webp' });
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage', Key: 'users/U1/resumes/R1.json' })
      .resolves({ Body: bodyOf(JSON.stringify(resume)), ETag: '"e"' });
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage', Key: 'users/U1/photos/R1.webp' })
      .rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(out.hasPhoto, false);
    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    assert.ok(puts.find((p) => p.Key === `resumes/${out.slug}.html`));
  });

  it('first publish with IfNoneMatch retries on slug collision and succeeds', async () => {
    let htmlPutAttempts = 0;
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(baseResume())), ETag: '"e"' });
    // First HTML put collides, second succeeds. PDF + back-write + anything else untouched.
    s3.on(PutObjectCommand).callsFake(async (cmd) => {
      const { Key, IfNoneMatch } = cmd.input ?? cmd;
      if (Key.startsWith('resumes/') && Key.endsWith('.html') && IfNoneMatch === '*') {
        htmlPutAttempts += 1;
        if (htmlPutAttempts === 1) {
          const err = new Error('slug taken');
          err.name = 'PreconditionFailed';
          throw err;
        }
      }
      return { ETag: '"new"' };
    });
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(htmlPutAttempts, 2);
    assert.match(out.slug, /^[0-9a-z]{12}$/);

    // Verify ALL html puts on first publish used IfNoneMatch (the guard).
    const htmlPuts = s3.commandCalls(PutObjectCommand)
      .map((c) => c.args[0].input)
      .filter((p) => p.Key?.endsWith('.html'));
    assert.ok(htmlPuts.every((p) => p.IfNoneMatch === '*'), 'every first-publish html put must be conditional');
  });

  it('first publish throws SlugCollisionExhausted after FIRST_PUBLISH_MAX_RETRIES collisions', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(baseResume())), ETag: '"e"' });
    s3.on(PutObjectCommand).callsFake(async (cmd) => {
      const { Key, IfNoneMatch } = cmd.input ?? cmd;
      if (Key.startsWith('resumes/') && Key.endsWith('.html') && IfNoneMatch === '*') {
        const err = new Error('slug taken');
        err.name = 'PreconditionFailed';
        throw err;
      }
      return { ETag: '"new"' };
    });

    await assert.rejects(() => runPublish(), (err) => err.name === 'SlugCollisionExhausted');
  });

  it('republish writes HTML WITHOUT IfNoneMatch (we already own the slug)', async () => {
    const existing = baseResume({ published: { slug: 'existingsslug', publishedAt: '2026-04-01T00:00:00.000Z' } });
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(existing)), ETag: '"e"' });
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });
    cf.on(CreateInvalidationCommand).resolves({});

    await runPublish();

    const htmlPut = s3.commandCalls(PutObjectCommand)
      .map((c) => c.args[0].input)
      .find((p) => p.Key === 'resumes/existingsslug.html');
    assert.ok(htmlPut, 'html put');
    assert.equal(htmlPut.IfNoneMatch, undefined, 'republish must NOT set IfNoneMatch');
  });

  it('invalidates exactly two slug paths (html + pdf — no separate image artifact)', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(baseResume())), ETag: '"e"' });
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();

    const inv = cf.commandCalls(CreateInvalidationCommand)[0].args[0].input;
    assert.equal(inv.DistributionId, 'DIST');
    assert.deepEqual(
      inv.InvalidationBatch.Paths.Items.sort(),
      [`/resumes/${out.slug}.html`, `/resumes/${out.slug}.pdf`],
    );
  });

  it('rejects when the resume owner does not match the caller', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(baseResume({ ownerCustomId: 'OTHER' }))), ETag: '"e"' });
    await assert.rejects(() => runPublish(), /Forbidden/);
  });

  it('throws NotFound when the resume does not exist', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    await assert.rejects(() => runPublish(), /NotFound/);
  });
});
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement `publish.js`**

```javascript
// packages/functions/renderer/src/publish.js
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { renderFromDisk } from '../../../shared/renderer.node.js';
import { htmlToPdf as defaultHtmlToPdf } from './browser.js';
import { newSlug } from './slug.js';
import { publishedKeys } from './published-keys.js';

const s3 = new S3Client({});
const cf = new CloudFrontClient({});

// Probability of a real collision in 36^12 space (4.7e18) is essentially zero at our scale,
// but we still guard first-publish writes with `IfNoneMatch: '*'` to prevent cross-user
// bleed if it ever happens. Five is a generous ceiling — a single collision is already
// astronomically unlikely, and five in a row approaches lottery-winning odds.
const FIRST_PUBLISH_MAX_RETRIES = 5;

class NotFoundError extends Error { constructor(m) { super(m); this.name = 'NotFound'; } }
class ForbiddenError extends Error { constructor(m) { super(m); this.name = 'Forbidden'; } }
class SlugCollisionExhaustedError extends Error {
  constructor() {
    super(`slug collision unresolved after ${FIRST_PUBLISH_MAX_RETRIES} attempts`);
    this.name = 'SlugCollisionExhausted';
  }
}

const loadResume = async ({ storageBucket, customId, resumeId, client }) => {
  try {
    const obj = await client.send(new GetObjectCommand({
      Bucket: storageBucket,
      Key: `users/${customId}/resumes/${resumeId}.json`,
    }));
    const resume = JSON.parse(await obj.Body.transformToString());
    return { resume, etag: obj.ETag };
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      throw new NotFoundError(`resume ${resumeId} not found`);
    }
    throw err;
  }
};

// Read the already-processed WebP (produced by the image-resizer Lambda) and return
// a data URI for inline embedding in the published HTML. Returns null if the photo
// isn't there — usually means the image-resizer hasn't processed the latest upload yet.
const loadPhotoDataUri = async ({ storageBucket, photoKey, client }) => {
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: storageBucket, Key: photoKey }));
    const buf = Buffer.from(await obj.Body.transformToByteArray());
    return `data:image/webp;base64,${buf.toString('base64')}`;
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
};

/**
 * Publish pipeline.
 * @param {object} p
 * @param {string} p.customId
 * @param {string} p.resumeId
 * @param {string} p.templatesDir        absolute path to the templates dir (baked in image at /var/task/templates)
 * @param {string} p.storageBucket
 * @param {string} p.publishedBucket
 * @param {string} p.cloudfrontDistId
 * @param {(html: string, format: string) => Promise<Buffer>} [p.htmlToPdf]  test seam
 * @param {S3Client} [p.s3Client]
 * @param {CloudFrontClient} [p.cfClient]
 * @returns {Promise<{ slug: string, hasPhoto: boolean }>}
 */
export const publish = async ({
  customId,
  resumeId,
  templatesDir,
  storageBucket,
  publishedBucket,
  cloudfrontDistId,
  htmlToPdf = defaultHtmlToPdf,
  s3Client = s3,
  cfClient = cf,
}) => {
  const { resume, etag } = await loadResume({ storageBucket, customId, resumeId, client: s3Client });
  if (resume.ownerCustomId !== customId) {
    throw new ForbiddenError('not your resume');
  }

  const isFirstPublish = !resume.published?.slug;
  let slug = resume.published?.slug ?? newSlug();

  // Inline the processed photo (produced by image-resizer) as a data URI; null if missing.
  const photoSrc = resume.photoKey
    ? await loadPhotoDataUri({ storageBucket, photoKey: resume.photoKey, client: s3Client })
    : null;

  // Render HTML + PDF ONCE. Templates don't embed the slug (only `_photoSrc` and the
  // resume data), so the HTML bytes are identical across any collision retries — we just
  // write them at a different S3 key.
  const html = renderFromDisk({
    templatesDir,
    resume: { ...resume, _photoSrc: photoSrc },
  });
  const pdf = await htmlToPdf(html, resume.paperSize);

  // --- Claim the slug ---
  // First publish: conditional PutObject with `IfNoneMatch: '*'` claims the slug atomically.
  //   On 412 (PreconditionFailed == slug already in use), regenerate + retry up to
  //   FIRST_PUBLISH_MAX_RETRIES. This prevents a cross-user slug collision from overwriting
  //   someone else's published HTML.
  // Republish: unconditional overwrite (we already own this slug — it's stored on the resume).
  if (isFirstPublish) {
    for (let attempt = 0; ; attempt += 1) {
      const keys = publishedKeys(slug);
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: publishedBucket, Key: keys.html, Body: html,
          ContentType: 'text/html; charset=utf-8',
          CacheControl: 'public, max-age=3600',
          IfNoneMatch: '*',
        }));
        break;
      } catch (err) {
        if (err.name !== 'PreconditionFailed') throw err;
        if (attempt + 1 >= FIRST_PUBLISH_MAX_RETRIES) throw new SlugCollisionExhaustedError();
        slug = newSlug();
      }
    }
  } else {
    const keys = publishedKeys(slug);
    await s3Client.send(new PutObjectCommand({
      Bucket: publishedBucket, Key: keys.html, Body: html,
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'public, max-age=3600',
    }));
  }

  // The slug is now locked in (either first-publish claim succeeded or we already owned it).
  const keys = publishedKeys(slug);

  // PDF — unconditional. We own the slug at this point.
  await s3Client.send(new PutObjectCommand({
    Bucket: publishedBucket, Key: keys.pdf, Body: pdf,
    ContentType: 'application/pdf',
    CacheControl: 'public, max-age=3600',
  }));

  // Write `published` back onto the resume (conditional so concurrent editor saves are respected).
  const updated = { ...resume, published: { slug, publishedAt: new Date().toISOString() } };
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: storageBucket,
      Key: `users/${customId}/resumes/${resumeId}.json`,
      Body: JSON.stringify(updated),
      ContentType: 'application/json',
      IfMatch: etag,
    }));
  } catch (err) {
    if (err.name === 'PreconditionFailed') {
      console.warn(`publish: concurrent edit on ${resumeId}; artifacts are live but back-write skipped. Client should refetch.`);
    } else {
      throw err;
    }
  }

  // Invalidate CF for the two published artifacts.
  const paths = [`/${keys.html}`, `/${keys.pdf}`];
  await cfClient.send(new CreateInvalidationCommand({
    DistributionId: cloudfrontDistId,
    InvalidationBatch: {
      CallerReference: `publish-${slug}-${Date.now()}`,
      Paths: { Quantity: paths.length, Items: paths },
    },
  }));

  return { slug, hasPhoto: Boolean(photoSrc) };
};

publish.NotFoundError = NotFoundError;
publish.ForbiddenError = ForbiddenError;
publish.SlugCollisionExhaustedError = SlugCollisionExhaustedError;
```

- [ ] **Step 4: Run — pass; commit**

```bash
git add packages/functions/renderer/src/publish.js packages/functions/renderer/src/publish.test.js
git commit -m "feat(renderer): publish pipeline (render + PDF + photo + back-write + CF)"
```

---

### Task 7: `src/index.js` — API Gateway handler (TDD)

**Files:**
- Modify (replace stub): `packages/functions/renderer/src/index.js`
- Create: `packages/functions/renderer/src/index.test.js`

- [ ] **Step 1: Failing test**

```javascript
// packages/functions/renderer/src/index.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Fix TEMPLATES_DIR to a known layout before import.
const tmpTplRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-index-'));
fs.mkdirSync(path.join(tmpTplRoot, 'monaco'), { recursive: true });
fs.writeFileSync(path.join(tmpTplRoot, 'monaco/template.hbs'), `<!doctype html><html><head><!-- CSS_PLACEHOLDER --></head><body>{{title}}</body></html>`);
fs.writeFileSync(path.join(tmpTplRoot, 'monaco/style.css'), `body{}`);
fs.writeFileSync(path.join(tmpTplRoot, 'monaco/meta.json'), JSON.stringify({ name: 'Monaco', description: '', supportsPhoto: true, supportedPaperSizes: ['A4'] }));

process.env.RESUMES_STORAGE_BUCKET   = 'visual-resumes-storage';
process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
process.env.CLOUDFRONT_DIST_ID       = 'DIST';
process.env.TEMPLATES_DIR            = tmpTplRoot;

// Stub chromium so the test never boots a real browser.
process.env.RENDERER_DISABLE_CHROMIUM = '1';

const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

const { handler } = await import('./index.js');

beforeEach(() => { s3.reset(); cf.reset(); });

const resume = () => ({
  id: 'R1', ownerCustomId: 'U1', title: 'EN', templateId: 'monaco', paperSize: 'A4',
  photoKey: null, sections: [], published: null,
});

const evt = (over = {}) => ({
  routeKey: 'POST /api/resumes/{id}/publish',
  pathParameters: { id: 'R1' },
  requestContext: { authorizer: { jwt: { claims: { 'custom:Id': 'U1' } } } },
  ...over,
});

describe('renderer handler', () => {
  it('200 on successful publish, returns slug + URLs', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(resume()) },
      ETag: '"e"',
    });
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const res = await handler(evt());
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.match(body.slug, /^[0-9a-z]{12}$/);
    assert.equal(body.hasPhoto, false);
  });

  it('401 when JWT claim is missing', async () => {
    const res = await handler({ ...evt(), requestContext: {} });
    assert.equal(res.statusCode, 401);
  });

  it('404 when resume does not exist', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    const res = await handler(evt());
    assert.equal(res.statusCode, 404);
  });

  it('403 when resume ownerCustomId does not match caller', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({ ...resume(), ownerCustomId: 'OTHER' }) },
      ETag: '"e"',
    });
    const res = await handler(evt());
    assert.equal(res.statusCode, 403);
  });
});
```

- [ ] **Step 2: Replace the stub `src/index.js`**

```javascript
// packages/functions/renderer/src/index.js
import { publish } from './publish.js';

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
};

const chromiumDisabled = () => process.env.RENDERER_DISABLE_CHROMIUM === '1';

const fakeHtmlToPdfForTests = async (html) => Buffer.from(`PDF:${html.length}`);

const response = (statusCode, bodyObject) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(bodyObject),
});

const error = (statusCode, code, message) => response(statusCode, { error: code, message });

const extractUser = (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || !claims['custom:Id']) {
    const err = new Error('missing custom:Id claim');
    err.code = 'Unauthorized';
    throw err;
  }
  return { customId: claims['custom:Id'] };
};

export const handler = async (event) => {
  try {
    const user = extractUser(event);
    const resumeId = event.pathParameters?.id;
    if (!resumeId) return error(400, 'BadRequest', 'missing id path parameter');

    // Lazy import of the real browser module so tests with RENDERER_DISABLE_CHROMIUM=1 never touch chromium.
    let htmlToPdf;
    if (chromiumDisabled()) {
      htmlToPdf = fakeHtmlToPdfForTests;
    } else {
      ({ htmlToPdf } = await import('./browser.js'));
    }

    const out = await publish({
      customId: user.customId,
      resumeId,
      templatesDir:     required('TEMPLATES_DIR'),
      storageBucket:    required('RESUMES_STORAGE_BUCKET'),
      publishedBucket:  required('RESUMES_PUBLISHED_BUCKET'),
      cloudfrontDistId: required('CLOUDFRONT_DIST_ID'),
      htmlToPdf,
    });

    return response(200, out);
  } catch (err) {
    if (err.code === 'Unauthorized') return error(401, 'Unauthorized', err.message);
    if (err.name === 'NotFound')     return error(404, 'NotFound', err.message);
    if (err.name === 'Forbidden')    return error(403, 'Forbidden', err.message);

    console.error('renderer unhandled error', err);
    return error(500, 'InternalError', 'publish failed');
  }
};
```

- [ ] **Step 3: Run — pass; commit**

Run: `cd packages/functions && yarn test`

```bash
git add packages/functions/renderer/src/index.js packages/functions/renderer/src/index.test.js
git commit -m "feat(renderer): handler dispatch + error contract"
```

---

### Task 8: `src/local-render.js` — dev convenience (HTML only)

**Files:**
- Create: `packages/functions/renderer/src/local-render.js`

- [ ] **Step 1: Write**

```javascript
// packages/functions/renderer/src/local-render.js
// Usage: TEMPLATES_DIR=../templates node src/local-render.js <path-to-resume.json>
// Prints rendered HTML to stdout. No PDF generation.
import fs from 'node:fs';
import path from 'node:path';
import { renderFromDisk } from '../../../shared/renderer.node.js';

const [, , jsonPath] = process.argv;
if (!jsonPath) {
  console.error('usage: local-render.js <resume.json>');
  process.exit(1);
}

const templatesDir = process.env.TEMPLATES_DIR ?? path.join(process.cwd(), 'packages', 'templates');

const resume = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const html = renderFromDisk({ templatesDir, resume });
process.stdout.write(html);
```

- [ ] **Step 2: Commit**

```bash
git add packages/functions/renderer/src/local-render.js
git commit -m "feat(renderer): local-render dev CLI (HTML-only)"
```

---

### Task 9: Runtime `package.runtime.json` + real Dockerfile

**Files:**
- Create: `packages/functions/renderer/package.runtime.json`
- Modify (replace): `packages/functions/renderer/Dockerfile`

- [ ] **Step 1: `package.runtime.json`**

```json
{
  "name": "renderer-runtime",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "@sparticuz/chromium-min": "137.0.1",
    "puppeteer-core": "24.10.0"
  }
}
```

- [ ] **Step 2: `Dockerfile`**

```dockerfile
# Multi-stage: stage 1 installs puppeteer-core + @sparticuz/chromium-min against Linux/arm64 so
# the native binaries match the Lambda runtime (Graviton). It ALSO downloads the arm64 Chromium
# pack (chromium-min ships no binary; arm64 binaries live as release assets on GitHub).
# Stage 2 copies everything into the AWS Lambda Node 22 base image.
FROM public.ecr.aws/lambda/nodejs:22 AS deps
WORKDIR /build

# Keep in sync with package.runtime.json @sparticuz/chromium-min version.
ARG CHROMIUM_VERSION=137.0.1

COPY package.runtime.json package.json
RUN npm install --omit=dev --no-audit --no-fund --no-package-lock

# Extract the arm64 Chromium pack into /opt/chromium. browser.js calls
# chromium.executablePath('/opt/chromium') to launch without re-downloading at runtime.
RUN dnf install -y tar && \
    curl -fsSL -o /tmp/chromium-pack.tar \
      "https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.arm64.tar" && \
    mkdir -p /opt/chromium && \
    tar -xf /tmp/chromium-pack.tar -C /opt/chromium && \
    rm /tmp/chromium-pack.tar

FROM public.ecr.aws/lambda/nodejs:22
COPY --from=deps /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=deps /opt/chromium /opt/chromium
COPY bin/ ${LAMBDA_TASK_ROOT}/
ENV TEMPLATES_DIR=${LAMBDA_TASK_ROOT}/templates
ENV CHROMIUM_PACK_DIR=/opt/chromium
CMD ["index.handler"]
```

- [ ] **Step 3: Commit**

```bash
git add packages/functions/renderer/package.runtime.json packages/functions/renderer/Dockerfile
git commit -m "feat(renderer): Dockerfile with chromium + puppeteer-core"
```

---

### Task 10: Real `scripts/build.sh`

**Files:**
- Modify (replace): `packages/functions/renderer/scripts/build.sh`

- [ ] **Step 1: Replace with**

```bash
#!/usr/bin/env bash
# esbuild src/ → bin/, copy packages/templates/ → bin/templates/, then docker build.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_ROOT="$(cd "$DIR/.." && pwd)"
REPO_ROOT="$(cd "$FUNCTIONS_ROOT/.." && pwd)"
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
  --external:puppeteer-core \
  --external:@sparticuz/chromium \
  --external:@aws-sdk/* \
  --legal-comments=none

cat > "$DIR/bin/package.json" <<'EOF'
{ "type": "module" }
EOF

# Templates: copy static content next to index.js
mkdir -p "$DIR/bin/templates"
cp -R "$REPO_ROOT/packages/templates/." "$DIR/bin/templates/"

# linux/amd64 (NOT arm64): @sparticuz/chromium ships an x86_64-only Chromium binary. Must match
# the Lambda `architecture = "x86_64"` setting in Terraform.
# --provenance=false + --sbom=false: AWS Lambda only accepts Docker v2 schema 2 manifests.
# Modern buildx defaults to OCI + attestations, which Lambda rejects.
docker buildx build --platform linux/amd64 --provenance=false --sbom=false --load \
  -t "visual-resumes-renderer:$TAG" "$DIR"
echo "built image visual-resumes-renderer:$TAG"
```

- [ ] **Step 2: Smoke-build locally**

Run: `packages/functions/renderer/scripts/build.sh latest`
Expected: image built. Chromium layer pull makes first build slow (~200 MB download); cached afterwards.

- [ ] **Step 3: Commit**

```bash
git add packages/functions/renderer/scripts/build.sh
git commit -m "feat(renderer): esbuild + templates copy + docker build"
```

---

### Task 11: Push + deploy + live publish smoke test

**Files:** none (operational).

- [ ] **Step 1: Push image**

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo eu-central-1)

packages/functions/renderer/scripts/build.sh "$(git rev-parse HEAD)"
packages/functions/renderer/scripts/push.sh  "$ACCOUNT_ID" "$REGION" "$(git rev-parse HEAD)"
```

- [ ] **Step 2: Apply Terraform with the new tag**

```bash
terraform -chdir=packages/infrastructure apply \
  -var="image_tag=$(git rev-parse HEAD)" \
  -auto-approve
```

Expected: `module.renderer.aws_lambda_function.this` updates.

- [ ] **Step 3: Create + save + publish a resume end-to-end**

```bash
export ID_TOKEN=<fresh token from editor placeholder login>
export HOST=https://visual-resumes.isnan.eu

# Create
RESUME=$(curl -sS -X POST -H "Authorization: Bearer $ID_TOKEN" -H "content-type: application/json" \
  -d '{"title":"Smoke","templateId":"monaco","paperSize":"A4"}' \
  "$HOST/api/resumes")
RID=$(echo "$RESUME" | jq -r .resume.id)
ETAG=$(echo "$RESUME" | jq -r .etag)

# Minimal save: add a contact section
BODY=$(echo "$RESUME" | jq '.resume | .sections = [{id:"s1",type:"contact",data:{name:"Ada",email:"ada@example.com",links:[]}}]')
curl -sS -X PUT -H "Authorization: Bearer $ID_TOKEN" -H "content-type: application/json" -H "if-match: $ETAG" \
  -d "$BODY" "$HOST/api/resumes/$RID" | jq

# Publish
PUB=$(curl -sS -X POST -H "Authorization: Bearer $ID_TOKEN" "$HOST/api/resumes/$RID/publish")
echo "$PUB" | jq
SLUG=$(echo "$PUB" | jq -r .slug)

# View the artifacts
curl -sS -o /dev/null -w "html: %{http_code}\n" "$HOST/resumes/$SLUG.html"
curl -sS -o /dev/null -w "pdf:  %{http_code}\n" "$HOST/resumes/$SLUG.pdf"
```

Expected: publish returns `{ slug, hasPhoto }` with status 200; `https://visual-resumes.isnan.eu/resumes/$SLUG.html` and `.pdf` both return 200 (CloudFront may need a few seconds to propagate after invalidation).

- [ ] **Step 4: Revoke (via api Lambda from Plan 3) — cleanup**

```bash
curl -sS -X POST -H "Authorization: Bearer $ID_TOKEN" "$HOST/api/resumes/$RID/revoke" -w "\n%{http_code}\n"
curl -sS -X DELETE -H "Authorization: Bearer $ID_TOKEN" "$HOST/api/resumes/$RID" -w "\n%{http_code}\n"
```

Expected: 204 on both.

---

### Task 12: Self-review

- [ ] Templates are loaded from `/var/task/templates` inside the image (confirm `TEMPLATES_DIR` is set by the Dockerfile).
- [ ] First publish generates a new 12-char slug; republish reuses existing slug.
- [ ] First publish uses `IfNoneMatch: '*'` on the HTML PutObject and retries on 412 up to `FIRST_PUBLISH_MAX_RETRIES` (5) — defense against slug collisions that would otherwise cross user boundaries. Republish writes without the guard.
- [ ] Missing photo is tolerated.
- [ ] Conditional write-back uses the `etag` from the initial GET — a concurrent editor save causes a warning log, not a failure (the artifacts are already public by then).
- [ ] CF invalidation batches exactly the three slug paths.
- [ ] Puppeteer + chromium are externalized from esbuild, installed fresh in the container.
- [ ] Image size stays under Lambda's 10 GB cap (expected ~400 MB).

---

## Self-review checklist

- [ ] `yarn test` green (slug, published-keys, photo, publish, index). No real chromium in tests.
- [ ] `yarn lint` clean.
- [ ] Chromium executable path works (`RENDERER_DISABLE_CHROMIUM` is test-only — never set in production).
- [ ] `page.pdf({ format: paperSize })` honors both `A4` and `Letter`.
- [ ] Local `node src/local-render.js path/to/resume.json` produces HTML only.
- [ ] Published artifacts have `Cache-Control: public, max-age=3600`.

## Out of scope

- Server-side PDF re-rendering with different scales (only one PDF format per paperSize for MVP).
- Localization / RTL (`lang="en"` hardcoded in templates).
- Pre-warm / provisioned concurrency to cut cold starts — not needed at 5-user scale.
- Editor UI for publishing — Plan 6 wires the Publish button.
