import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { renderFromDisk } from '../../../shared/renderer.node.js';
import { htmlToPdf as defaultHtmlToPdf } from './browser.js';
import { newSlug } from './slug.js';
import { publishedKeys } from './published-keys.js';

const s3 = new S3Client({});
const cf = new CloudFrontClient({});

// Probability of a real collision in 36^12 space (4.7e18) is essentially zero at our scale,
// but we still guard first-publish writes with `IfNoneMatch: '*'` to prevent cross-user
// bleed if it ever happens. Five is a generous ceiling — a single collision is already
// astronomically unlikely, and five in a row approaches lottery-winning odds.
const FIRST_PUBLISH_MAX_RETRIES = 5;

class NotFoundError extends Error { constructor(m) { super(m); this.name = 'NotFound'; } }
class ForbiddenError extends Error { constructor(m) { super(m); this.name = 'Forbidden'; } }
class SlugCollisionExhaustedError extends Error {
  constructor() {
    super(`slug collision unresolved after ${FIRST_PUBLISH_MAX_RETRIES} attempts`);
    this.name = 'SlugCollisionExhausted';
  }
}

const loadResume = async ({ storageBucket, customId, resumeId, client }) => {
  try {
    const obj = await client.send(new GetObjectCommand({
      Bucket: storageBucket,
      Key: `users/${customId}/resumes/${resumeId}.json`,
    }));
    const resume = JSON.parse(await obj.Body.transformToString());
    return { resume, etag: obj.ETag };
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      throw new NotFoundError(`resume ${resumeId} not found`);
    }
    throw err;
  }
};

// Read the already-processed WebP (produced by the image-resizer Lambda) and return
// a data URI for inline embedding in the published HTML. Returns null if the photo
// isn't there — usually means the image-resizer hasn't processed the latest upload yet.
const loadPhotoDataUri = async ({ storageBucket, photoKey, client }) => {
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: storageBucket, Key: photoKey }));
    const buf = Buffer.from(await obj.Body.transformToByteArray());
    return `data:image/webp;base64,${buf.toString('base64')}`;
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
};

export const publish = async ({
  customId,
  resumeId,
  templatesDir,
  storageBucket,
  publishedBucket,
  cloudfrontDistId,
  htmlToPdf = defaultHtmlToPdf,
  s3Client = s3,
  cfClient = cf,
}) => {
  const { resume, etag } = await loadResume({ storageBucket, customId, resumeId, client: s3Client });
  if (resume.ownerCustomId !== customId) {
    throw new ForbiddenError('not your resume');
  }

  const isFirstPublish = !resume.published?.slug;
  let slug = resume.published?.slug ?? newSlug();

  // Inline the processed photo (produced by image-resizer) as a data URI; null if missing.
  const photoSrc = resume.photoKey
    ? await loadPhotoDataUri({ storageBucket, photoKey: resume.photoKey, client: s3Client })
    : null;

  // Render HTML + PDF ONCE. Templates don't embed the slug (only `_photoSrc` and the
  // resume data), so the HTML bytes are identical across any collision retries — we just
  // write them at a different S3 key.
  const html = renderFromDisk({
    templatesDir,
    resume: { ...resume, _photoSrc: photoSrc },
  });
  const pdf = await htmlToPdf(html, resume.paperSize);

  // First publish: conditional PutObject with `IfNoneMatch: '*'` claims the slug atomically.
  //   On 412 (PreconditionFailed == slug already in use), regenerate + retry up to
  //   FIRST_PUBLISH_MAX_RETRIES. Prevents cross-user slug collision from overwriting
  //   someone else's published HTML.
  // Republish: unconditional overwrite (we already own this slug — stored on the resume).
  if (isFirstPublish) {
    for (let attempt = 0; ; attempt += 1) {
      const keys = publishedKeys(slug);
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: publishedBucket, Key: keys.html, Body: html,
          ContentType: 'text/html; charset=utf-8',
          CacheControl: 'public, max-age=3600',
          IfNoneMatch: '*',
        }));
        break;
      } catch (err) {
        if (err.name !== 'PreconditionFailed') throw err;
        if (attempt + 1 >= FIRST_PUBLISH_MAX_RETRIES) throw new SlugCollisionExhaustedError();
        slug = newSlug();
      }
    }
  } else {
    const keys = publishedKeys(slug);
    await s3Client.send(new PutObjectCommand({
      Bucket: publishedBucket, Key: keys.html, Body: html,
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'public, max-age=3600',
    }));
  }

  const keys = publishedKeys(slug);

  // PDF — unconditional. We own the slug at this point.
  await s3Client.send(new PutObjectCommand({
    Bucket: publishedBucket, Key: keys.pdf, Body: pdf,
    ContentType: 'application/pdf',
    CacheControl: 'public, max-age=3600',
  }));

  // Write `published` back onto the resume (conditional so concurrent editor saves are respected).
  // WHY we capture+return the resulting ETag: the back-write rotates the resume-JSON's
  // S3 ETag, so the editor's `state.etag` is otherwise stale on the very next autosave
  // and every post-publish save 412s ("Your copy was stale — reloaded"). The renderer
  // handler surfaces this as the `etag` HTTP response header (mirrors put-resume).
  const updated = { ...resume, published: { slug, publishedAt: new Date().toISOString() } };
  let resumeEtag;
  let conflict = false;
  try {
    const result = await s3Client.send(new PutObjectCommand({
      Bucket: storageBucket,
      Key: `users/${customId}/resumes/${resumeId}.json`,
      Body: JSON.stringify(updated),
      ContentType: 'application/json',
      IfMatch: etag,
    }));
    resumeEtag = result.ETag;
  } catch (err) {
    if (err.name === 'PreconditionFailed') {
      conflict = true;
      console.warn(`publish: concurrent edit on ${resumeId}; artifacts are live but back-write skipped. Client should refetch.`);
    } else {
      throw err;
    }
  }

  const paths = [`/${keys.html}`, `/${keys.pdf}`];
  await cfClient.send(new CreateInvalidationCommand({
    DistributionId: cloudfrontDistId,
    InvalidationBatch: {
      CallerReference: `publish-${slug}-${Date.now()}`,
      Paths: { Quantity: paths.length, Items: paths },
    },
  }));

  return { slug, hasPhoto: Boolean(photoSrc), etag: resumeEtag, conflict };
};

publish.NotFoundError = NotFoundError;
publish.ForbiddenError = ForbiddenError;
publish.SlugCollisionExhaustedError = SlugCollisionExhaustedError;
