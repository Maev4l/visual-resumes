import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { callWithUser } from '../test-helpers.js';

const s3 = mockClient(S3Client);
beforeEach(() => {
  s3.reset();
  process.env.RESUMES_STORAGE_BUCKET = 'visual-resumes-storage';
  process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
  process.env.CLOUDFRONT_DIST_ID = 'DIST';
});

const get = (id) => callWithUser(`/api/resumes/${id}`);

describe('GET /api/resumes/{id}', () => {
  it('returns { resume, etag, photoDataUri: null } when the resume has no photo', async () => {
    s3.on(GetObjectCommand, { Key: 'users/U1/resumes/R1.json' }).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [], photoKey: null }) },
      ETag: '"abc"',
    });
    const res = await get('R1');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('etag'), '"abc"');
    const body = await res.json();
    assert.equal(body.resume.id, 'R1');
    assert.equal(body.etag, '"abc"');
    assert.equal(body.photoDataUri, null);
  });

  it('returns photoDataUri as a data:image/webp;base64,... string when the photo exists', async () => {
    const pixel = Buffer.from([0xff, 0xee, 0xdd]);
    s3.on(GetObjectCommand, { Key: 'users/U1/resumes/R1.json' }).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [], photoKey: 'users/U1/photos/R1.webp' }) },
      ETag: '"abc"',
    });
    s3.on(GetObjectCommand, { Key: 'users/U1/photos/R1.webp' }).resolves({
      Body: { transformToByteArray: async () => new Uint8Array(pixel) },
    });
    const res = await get('R1');
    const body = await res.json();
    assert.equal(body.photoDataUri, `data:image/webp;base64,${pixel.toString('base64')}`);
  });

  it('returns photoDataUri: null when photoKey is set but the file is not ready yet (upload race)', async () => {
    s3.on(GetObjectCommand, { Key: 'users/U1/resumes/R1.json' }).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [], photoKey: 'users/U1/photos/R1.webp' }) },
      ETag: '"abc"',
    });
    s3.on(GetObjectCommand, { Key: 'users/U1/photos/R1.webp' }).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    const res = await get('R1');
    const body = await res.json();
    assert.equal(body.photoDataUri, null);
  });

  it('returns 404 when the resume itself is missing', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    const res = await get('R404');
    assert.equal(res.status, 404);
  });

  it('returns 403 when ownerCustomId does not match caller', async () => {
    s3.on(GetObjectCommand, { Key: 'users/U1/resumes/R1.json' }).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'OTHER', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [], photoKey: null }) },
      ETag: '"x"',
    });
    const res = await get('R1');
    assert.equal(res.status, 403);
  });
});
