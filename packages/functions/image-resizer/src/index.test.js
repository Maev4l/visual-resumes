import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { handler } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = fs.readFileSync(path.join(here, 'fixtures', 'test-600x400.jpg'));

const s3 = mockClient(S3Client);
beforeEach(() => { s3.reset(); });

const evt = (key, bucket = 'visual-resumes-storage') => ({
  Records: [{
    eventName: 'ObjectCreated:Put',
    s3: { bucket: { name: bucket }, object: { key } },
  }],
});

const bodyOf = (buf) => ({
  transformToByteArray: async () => new Uint8Array(buf),
});

describe('image-resizer handler', () => {
  it('processes photo-uploads/<customId>/<resumeId> → users/<customId>/photos/<resumeId>.webp', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(sample) });
    s3.on(PutObjectCommand).resolves({});

    await handler(evt('photo-uploads/U1/R1'));

    const puts = s3.commandCalls(PutObjectCommand);
    assert.equal(puts.length, 1);
    const input = puts[0].args[0].input;
    assert.equal(input.Bucket, 'visual-resumes-storage');
    assert.equal(input.Key, 'users/U1/photos/R1.webp');
    assert.equal(input.ContentType, 'image/webp');

    const meta = await sharp(input.Body).metadata();
    assert.equal(meta.format, 'webp');
    // 600x400 sample has longest side = 600 → fits within the 600x600 bounding box unchanged
    assert.equal(meta.width, 600);
    assert.equal(meta.height, 400);
  });

  it('skips keys that do not match photo-uploads/<id>/<id> (safety net)', async () => {
    await handler(evt('users/U1/photos/R1.webp'));  // output prefix — should never trigger anyway
    assert.equal(s3.commandCalls(GetObjectCommand).length, 0);
    assert.equal(s3.commandCalls(PutObjectCommand).length, 0);
  });

  it('does NOT delete the source — bucket lifecycle reaps photo-uploads after 1 day', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(sample) });
    s3.on(PutObjectCommand).resolves({});

    await handler(evt('photo-uploads/U1/R1'));

    // Only the one Put (output). No DeleteObject.
    // WHY query DeleteObjectCommand explicitly (deviation from plan): aws-sdk-client-mock@4.1.0
    // throws on `commandCalls()` with no args. Explicit command class is the supported API
    // and expresses the same assertion.
    assert.equal(s3.commandCalls(PutObjectCommand).length, 1);
    assert.equal(s3.commandCalls(DeleteObjectCommand).length, 0);
  });

  it('swallows malformed-image errors instead of failing (no retry storm on bad uploads)', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(Buffer.from('not an image')) });
    await handler(evt('photo-uploads/U1/R1'));
    // Source read happened; no Put because resize threw.
    assert.equal(s3.commandCalls(PutObjectCommand).length, 0);
  });

  it('handles multiple Records in one event', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(sample) });
    s3.on(PutObjectCommand).resolves({});

    await handler({
      Records: [
        { eventName: 'ObjectCreated:Put', s3: { bucket: { name: 'visual-resumes-storage' }, object: { key: 'photo-uploads/U1/R1' } } },
        { eventName: 'ObjectCreated:Put', s3: { bucket: { name: 'visual-resumes-storage' }, object: { key: 'photo-uploads/U2/R9' } } },
      ],
    });

    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key).sort();
    assert.deepEqual(puts, ['users/U1/photos/R1.webp', 'users/U2/photos/R9.webp']);
  });

  it('URL-decodes S3 keys (S3 delivers percent-encoded keys)', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(sample) });
    s3.on(PutObjectCommand).resolves({});

    await handler(evt('photo-uploads/U%201/R%20X'));

    const get = s3.commandCalls(GetObjectCommand)[0].args[0].input;
    assert.equal(get.Key, 'photo-uploads/U 1/R X');
    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    assert.equal(put.Key, 'users/U 1/photos/R X.webp');
  });
});
