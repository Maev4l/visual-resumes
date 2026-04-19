import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { photoUploadUrl } from './photo-upload-url.js';

const s3 = mockClient(S3Client);

beforeEach(() => {
  s3.reset();
  process.env.RESUMES_STORAGE_BUCKET = 'visual-resumes-storage';
  process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
  process.env.CLOUDFRONT_DIST_ID = 'DIST';
});

const evt = () => ({
  requestContext: { authorizer: { jwt: { claims: { 'custom:Id': 'U1' } } } },
  pathParameters: { id: 'R1' },
  body: JSON.stringify({}),
});

describe('POST /api/resumes/{id}/photo', () => {
  it('returns uploadUrl (→ photo-uploads) + the deterministic final photoKey (.webp)', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [] }) },
      ETag: '"e"',
    });

    const res = await photoUploadUrl(evt());
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    // The upload itself goes to photo-uploads/ (image-resizer processes it async).
    assert.match(body.uploadUrl, /photo-uploads\/U1\/R1/);
    // The final photoKey the client should persist on the resume is the processed .webp path.
    assert.equal(body.photoKey, 'users/U1/photos/R1.webp');
    assert.equal(body.expiresIn, 300);
    assert.equal(body.maxBytes, 5 * 1024 * 1024);
  });

  it('404 when resume does not exist', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    const res = await photoUploadUrl(evt());
    assert.equal(res.statusCode, 404);
  });

  it('403 when the resume belongs to a different user', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'OTHER', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [] }) },
      ETag: '"e"',
    });
    const res = await photoUploadUrl(evt());
    assert.equal(res.statusCode, 403);
  });
});
