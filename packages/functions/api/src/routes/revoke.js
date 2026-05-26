// POST /api/resumes/{id}/revoke — deletes published artifacts + invalidates CF, then
// writes published=null conditionally so we don't clobber a concurrent editor save.
import { getResume, putResumeConditional } from '../lib/storage-private.js';
import { revokePublished } from '../lib/storage-published.js';
import { config } from '../config.js';

export const revokeRoute = async (c) => {
  const customId = c.get('customId');
  const resumeId = c.req.param('id');

  const got = await getResume({
    bucket: config.storageBucket,
    customId,
    resumeId,
  });
  if (!got) return c.json({ error: 'NotFound', message: `resume ${resumeId} not found` }, 404);
  if (got.resume.ownerCustomId !== customId) {
    return c.json({ error: 'Forbidden', message: 'not your resume' }, 403);
  }
  if (!got.resume.published?.slug) {
    return c.json({ error: 'NotPublished', message: 'resume is not currently published' }, 409);
  }

  await revokePublished({
    publishedBucket: config.publishedBucket,
    distributionId: config.cloudfrontDistId,
    slug: got.resume.published.slug,
  });

  const updated = { ...got.resume, published: null };
  try {
    await putResumeConditional({
      bucket: config.storageBucket,
      customId,
      resumeId,
      resume: updated,
      etag: got.etag,
    });
  } catch (err) {
    if (err.name === 'PreconditionFailed') {
      // WHY swallow: artifacts are already deleted by the revoke step above, so this
      // endpoint's promise ("the public version is gone") is satisfied even though
      // the JSON still shows `published: { ... }`. Next editor save will naturally drop
      // that stale field when the user clicks through an unpublish prompt.
      console.warn(`revoke: concurrent edit on ${resumeId}; artifacts already deleted`);
    } else {
      throw err;
    }
  }

  return c.body(null, 204);
};
