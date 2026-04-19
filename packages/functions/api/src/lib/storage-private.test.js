import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import {
  listMyResumes, getResume, putResumeInitial, putResumeConditional,
  deleteResumeObjects, loadPhotoDataUri,
  resumeKey, photoKey, photoUploadKey,
} from './storage-private.js';

const s3 = mockClient(S3Client);

const BUCKET = 'visual-resumes-storage';

beforeEach(() => { s3.reset(); });

describe('storage key builders', () => {
  it('resumeKey', () => {
    assert.equal(resumeKey('U1', 'R1'), 'users/U1/resumes/R1.json');
  });
  it('photoKey always ends in .webp', () => {
    assert.equal(photoKey('U1', 'R1'), 'users/U1/photos/R1.webp');
  });
  it('photoUploadKey targets the top-level photo-uploads prefix', () => {
    assert.equal(photoUploadKey('U1', 'R1'), 'photo-uploads/U1/R1');
  });
});

describe('storage-private I/O', () => {
  it('listMyResumes parses all JSON objects under users/<id>/resumes/', async () => {
    s3.on(ListObjectsV2Command, { Bucket: BUCKET, Prefix: 'users/U1/resumes/' }).resolves({
      Contents: [
        { Key: 'users/U1/resumes/R1.json' },
        { Key: 'users/U1/resumes/R2.json' },
      ],
    });
    s3.on(GetObjectCommand, { Bucket: BUCKET, Key: 'users/U1/resumes/R1.json' }).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [] }) },
      ETag: '"etag-R1"',
      LastModified: new Date('2026-04-17T10:00:00Z'),
    });
    s3.on(GetObjectCommand, { Bucket: BUCKET, Key: 'users/U1/resumes/R2.json' }).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R2', ownerCustomId: 'U1', title: 'B', templateId: 'modern', paperSize: 'A4', sections: [], published: { slug: 'abc123def456', publishedAt: '2026-04-10T00:00:00Z' } }) },
      ETag: '"etag-R2"',
      LastModified: new Date('2026-04-18T10:00:00Z'),
    });

    const rows = await listMyResumes({ bucket: BUCKET, customId: 'U1' });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'R1');
    assert.equal(rows[1].published.slug, 'abc123def456');
  });

  it('getResume returns { resume, etag } on hit', async () => {
    s3.on(GetObjectCommand, { Bucket: BUCKET, Key: 'users/U1/resumes/R1.json' }).resolves({
      Body: { transformToString: async () => JSON.stringify({ id: 'R1', ownerCustomId: 'U1', title: 'A', templateId: 'monaco', paperSize: 'A4', sections: [] }) },
      ETag: '"abc"',
    });
    const got = await getResume({ bucket: BUCKET, customId: 'U1', resumeId: 'R1' });
    assert.equal(got.etag, '"abc"');
    assert.equal(got.resume.id, 'R1');
  });

  it('getResume returns null on NoSuchKey', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no such key'), { name: 'NoSuchKey' }));
    const got = await getResume({ bucket: BUCKET, customId: 'U1', resumeId: 'R404' });
    assert.equal(got, null);
  });

  it('putResumeInitial uses If-None-Match to prevent overwrite', async () => {
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });
    const { etag } = await putResumeInitial({ bucket: BUCKET, customId: 'U1', resumeId: 'R1', resume: { id: 'R1' } });
    const call = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    assert.equal(call.IfNoneMatch, '*');
    assert.equal(call.Key, 'users/U1/resumes/R1.json');
    assert.equal(etag, '"new"');
  });

  it('putResumeConditional uses If-Match for optimistic concurrency', async () => {
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });
    const { etag } = await putResumeConditional({ bucket: BUCKET, customId: 'U1', resumeId: 'R1', resume: { id: 'R1' }, etag: '"old"' });
    const call = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    assert.equal(call.IfMatch, '"old"');
    assert.equal(etag, '"new"');
  });

  it('putResumeConditional surfaces PreconditionFailed as the error code "PreconditionFailed"', async () => {
    s3.on(PutObjectCommand).rejects(Object.assign(new Error('412'), { name: 'PreconditionFailed' }));
    await assert.rejects(
      () => putResumeConditional({ bucket: BUCKET, customId: 'U1', resumeId: 'R1', resume: {}, etag: '"old"' }),
      (err) => err.name === 'PreconditionFailed',
    );
  });

  it('deleteResumeObjects removes JSON + processed photo + any in-flight upload', async () => {
    s3.on(DeleteObjectCommand).resolves({});
    await deleteResumeObjects({ bucket: BUCKET, customId: 'U1', resumeId: 'R1' });
    const keys = s3.commandCalls(DeleteObjectCommand).map((c) => c.args[0].input.Key).sort();
    assert.deepEqual(keys, [
      'photo-uploads/U1/R1',
      'users/U1/photos/R1.webp',
      'users/U1/resumes/R1.json',
    ]);
  });

  it('loadPhotoDataUri returns a data URI when the object exists', async () => {
    const pixel = Buffer.from([0xff, 0xee, 0xdd]);
    s3.on(GetObjectCommand, { Bucket: BUCKET, Key: 'users/U1/photos/R1.webp' }).resolves({
      Body: { transformToByteArray: async () => new Uint8Array(pixel) },
    });
    const uri = await loadPhotoDataUri({ bucket: BUCKET, customId: 'U1', resumeId: 'R1' });
    assert.equal(uri, `data:image/webp;base64,${pixel.toString('base64')}`);
  });

  it('loadPhotoDataUri returns null when the photo does not exist (e.g. upload still in flight)', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    const uri = await loadPhotoDataUri({ bucket: BUCKET, customId: 'U1', resumeId: 'R1' });
    assert.equal(uri, null);
  });
});
