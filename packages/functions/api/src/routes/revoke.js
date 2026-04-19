// POST /api/resumes/{id}/revoke — deletes published artifacts + invalidates CF, then
// writes published=null conditionally so we don't clobber a concurrent editor save.
import { noContent, error } from '../lib/http.js';
import { extractUser } from '../lib/auth.js';
import { getResume, putResumeConditional } from '../lib/storage-private.js';
import { revokePublished } from '../lib/storage-published.js';
import { config } from '../config.js';

export const revokeRoute = async (event) => {
  const user = extractUser(event);
  const resumeId = event.pathParameters?.id;
  if (!resumeId) return error(400, 'BadRequest', 'missing id path parameter');

  const got = await getResume({
    bucket: config.storageBucket,
    customId: user.customId,
    resumeId,
  });
  if (!got) return error(404, 'NotFound', `resume ${resumeId} not found`);
  if (got.resume.ownerCustomId !== user.customId) {
    return error(403, 'Forbidden', 'not your resume');
  }
  if (!got.resume.published?.slug) {
    return error(409, 'NotPublished', 'resume is not currently published');
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
      customId: user.customId,
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

  return noContent();
};
