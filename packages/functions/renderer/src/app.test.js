import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Fix TEMPLATES_DIR to a known layout before import.
const tmpTplRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-renderer-'));
fs.mkdirSync(path.join(tmpTplRoot, 'monaco'), { recursive: true });
fs.writeFileSync(path.join(tmpTplRoot, 'monaco/template.hbs'), `<!doctype html><html><head><!-- CSS_PLACEHOLDER --></head><body>{{title}}</body></html>`);
fs.writeFileSync(path.join(tmpTplRoot, 'monaco/style.css'), `body{}`);
fs.writeFileSync(path.join(tmpTplRoot, 'monaco/meta.json'), JSON.stringify({ name: 'Monaco', description: '', supportsPhoto: true, supportedPaperSizes: ['A4'] }));

process.env.RESUMES_STORAGE_BUCKET   = 'visual-resumes-storage';
process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
process.env.CLOUDFRONT_DIST_ID       = 'DIST';
process.env.TEMPLATES_DIR            = tmpTplRoot;
process.env.RENDERER_DISABLE_CHROMIUM = '1';

const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

// Dynamic import preserves the env-then-import order from the old test (app.js → publish.js → browser.js).
const { callWithUser, callAnon } = await import('./test-helpers.js');

beforeEach(() => { s3.reset(); cf.reset(); });

const resume = () => ({
  id: 'R1', ownerCustomId: 'U1', title: 'EN', templateId: 'monaco', paperSize: 'A4',
  photoKey: null, sections: [], published: null,
});

const publish = (customId) =>
  callWithUser('/api/resumes/R1/publish', { method: 'POST' }, customId);

describe('renderer app', () => {
  it('200 on successful publish, returns slug + hasPhoto', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(resume()) },
      ETag: '"e"',
    });
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const res = await publish();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.slug, /^[0-9a-z]{12}$/);
    assert.equal(body.hasPhoto, false);
  });

  // WHY: the editor must rotate state.etag after publish, otherwise the next
  // autosave 412s. Mirrors put-resume's contract — return the new etag both in
  // the body and as the `etag` HTTP response header.
  it('exposes the new resume-JSON etag both in the body and as an HTTP etag header', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(resume()) },
      ETag: '"old"',
    });
    s3.on(PutObjectCommand).callsFake(async (cmd) => {
      const { Bucket, Key } = cmd.input ?? cmd;
      if (Bucket === 'visual-resumes-storage' && Key === 'users/U1/resumes/R1.json') {
        return { ETag: '"resume-after-publish"' };
      }
      return {};
    });
    cf.on(CreateInvalidationCommand).resolves({});

    const res = await publish();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('etag'), '"resume-after-publish"');
    const body = await res.json();
    assert.equal(body.etag, '"resume-after-publish"');
  });

  it('401 when JWT claim is missing', async () => {
    const res = await callAnon('/api/resumes/R1/publish', { method: 'POST' });
    assert.equal(res.status, 401);
  });

  it('404 when resume does not exist', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    const res = await publish();
    assert.equal(res.status, 404);
  });

  it('403 when resume ownerCustomId does not match caller', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({ ...resume(), ownerCustomId: 'OTHER' }) },
      ETag: '"e"',
    });
    const res = await publish();
    assert.equal(res.status, 403);
  });
});
