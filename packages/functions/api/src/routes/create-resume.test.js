import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createResume } from './create-resume.js';

const s3 = mockClient(S3Client);
beforeEach(() => {
  s3.reset();
  process.env.RESUMES_STORAGE_BUCKET = 'visual-resumes-storage';
  process.env.RESUMES_PUBLISHED_BUCKET = 'visual-resumes-published';
  process.env.CLOUDFRONT_DIST_ID = 'DIST';
});

const evt = (body) => ({
  requestContext: { authorizer: { jwt: { claims: { 'custom:Id': 'U1' } } } },
  body: JSON.stringify(body),
});

describe('POST /api/resumes', () => {
  it('creates a new resume with ULID, empty sections, unpublished', async () => {
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });

    const res = await createResume(evt({ title: 'EN', templateId: 'monaco', paperSize: 'A4' }));
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.match(body.resume.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(body.resume.ownerCustomId, 'U1');
    assert.equal(body.resume.title, 'EN');
    assert.equal(body.resume.templateId, 'monaco');
    assert.equal(body.resume.paperSize, 'A4');
    assert.deepEqual(body.resume.sections, []);
    assert.equal(body.resume.published, null);
    assert.equal(body.resume.photoKey, null);
    assert.equal(body.etag, '"new"');

    const call = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    assert.equal(call.IfNoneMatch, '*');
    assert.match(call.Key, /^users\/U1\/resumes\/[0-9A-HJKMNP-TV-Z]{26}\.json$/);
  });

  it('rejects missing fields with 400', async () => {
    const res = await createResume(evt({ title: 'EN' }));
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /ValidationError/);
  });

  it('rejects unknown template', async () => {
    const res = await createResume(evt({ title: 'EN', templateId: 'bogus', paperSize: 'A4' }));
    assert.equal(res.statusCode, 400);
  });
});
