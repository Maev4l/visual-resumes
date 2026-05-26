import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { callWithUser } from '../test-helpers.js';

const s3 = mockClient(S3Client);
beforeEach(() => {
  s3.reset();
  process.env.RESUMES_STORAGE_BUCKET = 'visual-resumes-storage';
  process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
  process.env.CLOUDFRONT_DIST_ID = 'DIST';
});

describe('GET /api/resumes', () => {
  it('returns a trimmed summary per resume', async () => {
    s3.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: 'users/U1/resumes/R1.json' }],
    });
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({
        id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4',
        sections: [], published: null,
      }) },
      ETag: '"e1"',
      LastModified: new Date('2026-04-18T10:00:00Z'),
    });

    const res = await callWithUser('/api/resumes');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.resumes.length, 1);
    const row = body.resumes[0];
    assert.equal(row.id, 'R1');
    assert.equal(row.title, 'A');
    assert.equal(row.templateId, 'monaco');
    assert.equal(row.published, null);
    assert.equal(row.updatedAt, '2026-04-18T10:00:00.000Z');
  });
});
