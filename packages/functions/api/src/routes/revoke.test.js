import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { revokeRoute } from './revoke.js';

const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

beforeEach(() => {
  s3.reset(); cf.reset();
  process.env.RESUMES_STORAGE_BUCKET = 'visual-resumes-storage';
  process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
  process.env.CLOUDFRONT_DIST_ID = 'DIST';
});

const evt = () => ({
  requestContext: { authorizer: { jwt: { claims: { 'custom:Id': 'U1' } } } },
  pathParameters: { id: 'R1' },
});

describe('POST /api/resumes/{id}/revoke', () => {
  it('204 on revoke of a published resume (deletes artifacts + invalidates + sets published=null)', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [], published: { slug: 'abc123def456', publishedAt: '2026-04-10T00:00:00Z' } }) },
      ETag: '"e"',
    });
    s3.on(DeleteObjectCommand).resolves({});
    s3.on(PutObjectCommand).resolves({ ETag: '"e2"' });
    cf.on(CreateInvalidationCommand).resolves({});

    const res = await revokeRoute(evt());
    assert.equal(res.statusCode, 204);
    assert.equal(s3.commandCalls(DeleteObjectCommand).length, 3);
    assert.equal(cf.commandCalls(CreateInvalidationCommand).length, 1);

    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    const body = JSON.parse(put.Body);
    assert.equal(body.published, null);
    assert.equal(put.IfMatch, '"e"'); // conditional so we don't clobber edits
  });

  it('409 when resume is not published', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [], published: null }) },
      ETag: '"e"',
    });
    const res = await revokeRoute(evt());
    assert.equal(res.statusCode, 409);
  });

  it('404 when resume does not exist', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    const res = await revokeRoute(evt());
    assert.equal(res.statusCode, 404);
  });
});
