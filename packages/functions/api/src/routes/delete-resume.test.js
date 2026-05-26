import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { callWithUser } from '../test-helpers.js';

const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

beforeEach(() => {
  s3.reset(); cf.reset();
  process.env.RESUMES_STORAGE_BUCKET = 'visual-resumes-storage';
  process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
  process.env.CLOUDFRONT_DIST_ID = 'DIST';
});

const del = (id = 'R1') => callWithUser(`/api/resumes/${id}`, { method: 'DELETE' });

describe('DELETE /api/resumes/{id}', () => {
  it('404 when resume does not exist', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    const res = await del();
    assert.equal(res.status, 404);
  });

  it('204 on deletion of unpublished resume (no CF invalidation)', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [], published: null }) },
      ETag: '"e"',
    });
    s3.on(DeleteObjectCommand).resolves({});

    const res = await del();
    assert.equal(res.status, 204);
    assert.equal(cf.commandCalls(CreateInvalidationCommand).length, 0);
    assert.ok(s3.commandCalls(DeleteObjectCommand).length >= 3);
  });

  it('204 + revoke when resume was published', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [], published: { slug: 'abc123def456', publishedAt: '2026-04-10T00:00:00Z' } }) },
      ETag: '"e"',
    });
    s3.on(DeleteObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const res = await del();
    assert.equal(res.status, 204);
    assert.equal(cf.commandCalls(CreateInvalidationCommand).length, 1);
  });

  it('403 when not owner', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'OTHER', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [] }) },
      ETag: '"e"',
    });
    const res = await del();
    assert.equal(res.status, 403);
  });
});
