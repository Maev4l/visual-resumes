import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { putResumeRoute } from './put-resume.js';

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

const evt = ({ resumeId = 'R1', ifMatch = '"old"', body, customId = 'U1' } = {}) => ({
  requestContext: { authorizer: { jwt: { claims: { 'custom:Id': customId } } } },
  pathParameters: { id: resumeId },
  headers: { 'if-match': ifMatch },
  body: JSON.stringify(body ?? resume()),
});

describe('PUT /api/resumes/{id}', () => {
  it('requires If-Match header', async () => {
    const res = await putResumeRoute({ ...evt(), headers: {} });
    assert.equal(res.statusCode, 428);
  });

  it('400 on invalid body', async () => {
    const res = await putResumeRoute(evt({ body: { nope: true } }));
    assert.equal(res.statusCode, 400);
  });

  it('403 when body ownerCustomId does not match JWT customId', async () => {
    const res = await putResumeRoute(evt({ body: resume({ ownerCustomId: 'OTHER' }) }));
    assert.equal(res.statusCode, 403);
  });

  it('403 when path id does not match body id', async () => {
    const res = await putResumeRoute(evt({ body: resume({ id: 'DIFFERENT' }) }));
    assert.equal(res.statusCode, 400);
  });

  it('200 + new ETag on success', async () => {
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });
    const res = await putResumeRoute(evt());
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers.etag, '"new"');
    assert.equal(JSON.parse(res.body).etag, '"new"');
  });

  it('412 on ETag mismatch', async () => {
    s3.on(PutObjectCommand).rejects(Object.assign(new Error('412'), { name: 'PreconditionFailed' }));
    const res = await putResumeRoute(evt());
    assert.equal(res.statusCode, 412);
  });
});
