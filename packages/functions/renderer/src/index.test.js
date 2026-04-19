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
  it('200 on successful publish, returns slug + hasPhoto', async () => {
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
