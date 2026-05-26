// Cross-cutting middleware tests: 401 on missing claims, 404 on unknown route,
// 400 on malformed JSON body. Per-route assertions live in routes/*.test.js.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import { callWithUser, callAnon } from './test-helpers.js';

const s3 = mockClient(S3Client);
beforeEach(() => {
  s3.reset();
  process.env.RESUMES_STORAGE_BUCKET = 'visual-resumes-storage';
  process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
  process.env.CLOUDFRONT_DIST_ID = 'DIST';
});

describe('app middleware', () => {
  it('returns 401 when x-amzn-request-context is missing (no claims)', async () => {
    const res = await callAnon('/api/resumes');
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  it('returns 404 JSON for an unknown route', async () => {
    const res = await callWithUser('/api/something-else');
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'NotFound');
  });

  it('returns 400 BadRequest when POST body is malformed JSON', async () => {
    const res = await callWithUser('/api/resumes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'BadRequest');
  });
});
