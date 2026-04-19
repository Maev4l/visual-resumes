import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { handler } from './index.js';

const s3 = mockClient(S3Client);
beforeEach(() => {
  s3.reset();
  process.env.RESUMES_STORAGE_BUCKET = 'visual-resumes-storage';
  process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
  process.env.CLOUDFRONT_DIST_ID = 'DIST';
});

const claims = { 'custom:Id': 'U1' };

describe('handler dispatch', () => {
  it('routes GET /api/resumes to listResumes', async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [] });
    const res = await handler({
      routeKey: 'GET /api/resumes',
      requestContext: { authorizer: { jwt: { claims } } },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { resumes: [] });
  });

  it('returns 404 for an unknown route', async () => {
    const res = await handler({
      routeKey: 'GET /api/something-else',
      requestContext: { authorizer: { jwt: { claims } } },
    });
    assert.equal(res.statusCode, 404);
  });

  it('translates MissingClaimError into 401', async () => {
    const res = await handler({ routeKey: 'GET /api/resumes' });
    assert.equal(res.statusCode, 401);
  });

  it('catches InvalidJSON into 400', async () => {
    const res = await handler({
      routeKey: 'POST /api/resumes',
      requestContext: { authorizer: { jwt: { claims } } },
      body: '{not json',
    });
    assert.equal(res.statusCode, 400);
  });
});
