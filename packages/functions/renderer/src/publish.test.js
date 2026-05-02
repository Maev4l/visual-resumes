import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { publish } from './publish.js';

const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

let tmpTemplatesDir;

beforeEach(() => {
  s3.reset(); cf.reset();

  // Build a minimal templates dir for tests (bypasses the real packages/templates).
  tmpTemplatesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-tpl-'));
  const t = path.join(tmpTemplatesDir, 'monaco');
  fs.mkdirSync(t, { recursive: true });
  // Template references {{{_photoSrc}}} so the data-URI assertion in the photo test
  // has something to look at in the rendered HTML.
  fs.writeFileSync(path.join(t, 'template.hbs'),
    `<!doctype html><html><head><!-- CSS_PLACEHOLDER --></head><body><h1>{{title}}</h1>{{#if _photoSrc}}<img src="{{{_photoSrc}}}">{{/if}}</body></html>`);
  fs.writeFileSync(path.join(t, 'style.css'), `body{color:red;}`);
  fs.writeFileSync(path.join(t, 'meta.json'),
    JSON.stringify({ name: 'Monaco', description: '', supportsPhoto: true, supportedPaperSizes: ['A4'] }));
});

const bodyOf = (str) => ({ transformToString: async () => str });
const bufferBodyOf = (buf) => ({ transformToByteArray: async () => new Uint8Array(buf) });

const fakePdfFor = (html) => Buffer.from(`PDF:${html.length}`);
const fakeHtmlToPdf = async (html) => fakePdfFor(html);

const baseResume = (over = {}) => ({
  id: 'R1',
  ownerCustomId: 'U1',
  title: 'EN — Dev',
  templateId: 'monaco',
  paperSize: 'A4',
  photoKey: null,
  sections: [],
  published: null,
  ...over,
});

const runPublish = (resume, overrides = {}) =>
  publish({
    customId: 'U1',
    resumeId: 'R1',
    templatesDir: tmpTemplatesDir,
    storageBucket: 'visual-resumes-storage',
    publishedBucket: 'visual-resumes-published',
    cloudfrontDistId: 'DIST',
    htmlToPdf: fakeHtmlToPdf,
    ...overrides,
  });

describe('publish', () => {
  it('first-time publish: generates slug, writes HTML + PDF, no JPG, writes back published on the resume', async () => {
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage' })
      .callsFake(async () => ({ Body: bodyOf(JSON.stringify(baseResume())), ETag: '"old"' }));
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();

    assert.match(out.slug, /^[0-9a-z]{12}$/);
    assert.equal(out.hasPhoto, false);

    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    const htmlPut = puts.find((p) => p.Key === `resumes/${out.slug}.html`);
    const pdfPut  = puts.find((p) => p.Key === `resumes/${out.slug}.pdf`);
    assert.ok(htmlPut, 'html put');
    assert.ok(pdfPut, 'pdf put');
    assert.equal(htmlPut.ContentType, 'text/html; charset=utf-8');
    assert.equal(pdfPut.ContentType, 'application/pdf');

    const jsonPut = puts.find((p) => p.Key === 'users/U1/resumes/R1.json');
    assert.ok(jsonPut, 'resume json put');
    assert.equal(jsonPut.IfMatch, '"old"');
    const persisted = JSON.parse(jsonPut.Body);
    assert.equal(persisted.published.slug, out.slug);
    assert.match(persisted.published.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    assert.equal(cf.commandCalls(CreateInvalidationCommand).length, 1);
  });

  it('republish: reuses existing slug', async () => {
    const existing = baseResume({ published: { slug: 'existingsslug', publishedAt: '2026-04-01T00:00:00.000Z' } });
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage' })
      .callsFake(async () => ({ Body: bodyOf(JSON.stringify(existing)), ETag: '"e"' }));
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(out.slug, 'existingsslug');
  });

  // WHY: the publish back-write rotates the resume-JSON's S3 ETag. If we don't
  // surface the new value, the editor's `state.etag` stays stale and every
  // post-publish autosave 412s with "Your copy was stale — reloaded".
  it('returns the new etag from the resume-JSON back-write', async () => {
    const existing = baseResume({ published: { slug: 'existingsslug', publishedAt: '2026-04-01T00:00:00.000Z' } });
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(existing)), ETag: '"old"' });
    s3.on(PutObjectCommand).callsFake(async (cmd) => {
      const { Bucket, Key } = cmd.input ?? cmd;
      if (Bucket === 'visual-resumes-storage' && Key === 'users/U1/resumes/R1.json') {
        return { ETag: '"resume-after-publish"' };
      }
      return {};
    });
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(out.etag, '"resume-after-publish"');
    assert.equal(out.conflict, false);
  });

  it('flags conflict when the back-write 412s (concurrent edit during publish) and omits etag', async () => {
    const existing = baseResume({ published: { slug: 'existingsslug', publishedAt: '2026-04-01T00:00:00.000Z' } });
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(existing)), ETag: '"old"' });
    s3.on(PutObjectCommand).callsFake(async (cmd) => {
      const { Bucket, Key } = cmd.input ?? cmd;
      if (Bucket === 'visual-resumes-storage' && Key === 'users/U1/resumes/R1.json') {
        const err = new Error('stale');
        err.name = 'PreconditionFailed';
        throw err;
      }
      return {};
    });
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(out.conflict, true);
    assert.equal(out.etag, undefined);
    assert.equal(out.slug, 'existingsslug');
  });

  it('embeds the photo inline as a base64 data URI when photoKey is set; does NOT write a jpg to published', async () => {
    const webpBytes = Buffer.from([0xaa, 0xbb, 0xcc]);
    const resume = baseResume({ photoKey: 'users/U1/photos/R1.webp' });

    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage', Key: 'users/U1/resumes/R1.json' })
      .resolves({ Body: bodyOf(JSON.stringify(resume)), ETag: '"e"' });
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage', Key: 'users/U1/photos/R1.webp' })
      .resolves({ Body: bufferBodyOf(webpBytes) });
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(out.hasPhoto, true);

    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    assert.equal(puts.find((p) => p.Key?.endsWith('.jpg') || p.Key?.endsWith('.webp')), undefined);
    const htmlPut = puts.find((p) => p.Key === `resumes/${out.slug}.html`);
    const expected = `data:image/webp;base64,${webpBytes.toString('base64')}`;
    assert.ok(htmlPut.Body.includes(expected), 'HTML should inline the photo as a data URI');
  });

  it('tolerates a missing photo on republish — HTML still renders, just without the photo', async () => {
    const resume = baseResume({ photoKey: 'users/U1/photos/R1.webp' });
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage', Key: 'users/U1/resumes/R1.json' })
      .resolves({ Body: bodyOf(JSON.stringify(resume)), ETag: '"e"' });
    s3.on(GetObjectCommand, { Bucket: 'visual-resumes-storage', Key: 'users/U1/photos/R1.webp' })
      .rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(out.hasPhoto, false);
    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    assert.ok(puts.find((p) => p.Key === `resumes/${out.slug}.html`));
  });

  it('first publish with IfNoneMatch retries on slug collision and succeeds', async () => {
    let htmlPutAttempts = 0;
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(baseResume())), ETag: '"e"' });
    s3.on(PutObjectCommand).callsFake(async (cmd) => {
      const { Key, IfNoneMatch } = cmd.input ?? cmd;
      if (Key.startsWith('resumes/') && Key.endsWith('.html') && IfNoneMatch === '*') {
        htmlPutAttempts += 1;
        if (htmlPutAttempts === 1) {
          const err = new Error('slug taken');
          err.name = 'PreconditionFailed';
          throw err;
        }
      }
      return { ETag: '"new"' };
    });
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();
    assert.equal(htmlPutAttempts, 2);
    assert.match(out.slug, /^[0-9a-z]{12}$/);

    const htmlPuts = s3.commandCalls(PutObjectCommand)
      .map((c) => c.args[0].input)
      .filter((p) => p.Key?.endsWith('.html'));
    assert.ok(htmlPuts.every((p) => p.IfNoneMatch === '*'), 'every first-publish html put must be conditional');
  });

  it('first publish throws SlugCollisionExhausted after FIRST_PUBLISH_MAX_RETRIES collisions', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(baseResume())), ETag: '"e"' });
    s3.on(PutObjectCommand).callsFake(async (cmd) => {
      const { Key, IfNoneMatch } = cmd.input ?? cmd;
      if (Key.startsWith('resumes/') && Key.endsWith('.html') && IfNoneMatch === '*') {
        const err = new Error('slug taken');
        err.name = 'PreconditionFailed';
        throw err;
      }
      return { ETag: '"new"' };
    });

    await assert.rejects(() => runPublish(), (err) => err.name === 'SlugCollisionExhausted');
  });

  it('republish writes HTML WITHOUT IfNoneMatch (we already own the slug)', async () => {
    const existing = baseResume({ published: { slug: 'existingsslug', publishedAt: '2026-04-01T00:00:00.000Z' } });
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(existing)), ETag: '"e"' });
    s3.on(PutObjectCommand).resolves({ ETag: '"new"' });
    cf.on(CreateInvalidationCommand).resolves({});

    await runPublish();

    const htmlPut = s3.commandCalls(PutObjectCommand)
      .map((c) => c.args[0].input)
      .find((p) => p.Key === 'resumes/existingsslug.html');
    assert.ok(htmlPut, 'html put');
    assert.equal(htmlPut.IfNoneMatch, undefined, 'republish must NOT set IfNoneMatch');
  });

  it('invalidates exactly two slug paths (html + pdf — no separate image artifact)', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(baseResume())), ETag: '"e"' });
    s3.on(PutObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({});

    const out = await runPublish();

    const inv = cf.commandCalls(CreateInvalidationCommand)[0].args[0].input;
    assert.equal(inv.DistributionId, 'DIST');
    assert.deepEqual(
      inv.InvalidationBatch.Paths.Items.sort(),
      [`/resumes/${out.slug}.html`, `/resumes/${out.slug}.pdf`],
    );
  });

  it('rejects when the resume owner does not match the caller', async () => {
    s3.on(GetObjectCommand).resolves({ Body: bodyOf(JSON.stringify(baseResume({ ownerCustomId: 'OTHER' }))), ETag: '"e"' });
    await assert.rejects(() => runPublish(), /Forbidden/);
  });

  it('throws NotFound when the resume does not exist', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('no'), { name: 'NoSuchKey' }));
    await assert.rejects(() => runPublish(), /NotFound/);
  });
});
