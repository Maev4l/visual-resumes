import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { callWithUser } from '../test-helpers.js';

const s3 = mockClient(S3Client);
beforeEach(() => {
  s3.reset();
  process.env.RESUMES_STORAGE_BUCKET = 'visual-resumes-storage';
  process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
  process.env.CLOUDFRONT_DIST_ID = 'DIST';
});

const resume = (over = {}) => ({
  id: 'R1',
  ownerCustomId: 'U1',
  title: 'EN',
  templateId: 'monaco',
  paperSize: 'A4',
  photoKey: null,
  sections: [],
  published: null,
  ...over,
});

const put = ({ resumeId = 'R1', ifMatch = '"old"', body, customId = 'U1' } = {}) => {
  const headers = { 'content-type': 'application/json' };
  // null sentinel = omit the header entirely (undefined would trip the destructure default).
  if (ifMatch !== null) headers['if-match'] = ifMatch;
  return callWithUser(`/api/resumes/${resumeId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body ?? resume()),
  }, customId);
};

describe('PUT /api/resumes/{id}', () => {
  it('requires If-Match header', async () => {
    const res = await put({ ifMatch: null });
    assert.equal(res.status, 428);
  });

  it('400 on invalid body', async () => {
    const res = await put({ body: { nope: true } });
    assert.equal(res.status, 400);
  });

  it('403 when body ownerCustomId does not match JWT customId', async () => {
    const res = await put({ body: resume({ ownerCustomId: 'OTHER' }) });
    assert.equal(res.status, 403);
  });

  it('400 when path id does not match body id', async () => {
    const res = await put({ body: resume({ id: 'DIFFERENT' }) });
    assert.equal(res.status, 400);
  });

  it('200 + new ETag on success', async () => {
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });
    const res = await put();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('etag'), '"new"');
    const body = await res.json();
    assert.equal(body.etag, '"new"');
  });

  it('412 on ETag mismatch', async () => {
    s3.on(PutObjectCommand).rejects(Object.assign(new Error('412'), { name: 'PreconditionFailed' }));
    const res = await put();
    assert.equal(res.status, 412);
  });
});
