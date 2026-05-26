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

const post = (body) =>
  callWithUser('/api/resumes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/resumes', () => {
  it('creates a new resume with ULID, empty sections, unpublished', async () => {
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });

    const res = await post({ title: 'EN', templateId: 'monaco', paperSize: 'A4' });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.match(body.resume.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(body.resume.ownerCustomId, 'U1');
    assert.equal(body.resume.title, 'EN');
    assert.equal(body.resume.templateId, 'monaco');
    assert.equal(body.resume.paperSize, 'A4');
    assert.deepEqual(body.resume.sections, []);
    assert.equal(body.resume.published, null);
    assert.equal(body.resume.photoKey, null);
    assert.equal(body.etag, '"new"');
    assert.equal(res.headers.get('etag'), '"new"');

    const call = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    assert.equal(call.IfNoneMatch, '*');
    assert.match(call.Key, /^users\/U1\/resumes\/[0-9A-HJKMNP-TV-Z]{26}\.json$/);
  });

  it('rejects missing fields with 400', async () => {
    const res = await post({ title: 'EN' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'ValidationError');
  });

  it('rejects unknown template', async () => {
    const res = await post({ title: 'EN', templateId: 'bogus', paperSize: 'A4' });
    assert.equal(res.status, 400);
  });
});
