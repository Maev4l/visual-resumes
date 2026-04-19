// DELETE /api/resumes/{id} — if the resume was published, also deletes artifacts +
// invalidates CloudFront before removing the source-of-truth JSON.
import { noContent, error } from '../lib/http.js';
import { extractUser } from '../lib/auth.js';
import { getResume, deleteResumeObjects } from '../lib/storage-private.js';
import { revokePublished } from '../lib/storage-published.js';
import { config } from '../config.js';

export const deleteResumeRoute = async (event) => {
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

  // WHY revoke first (before deleting the JSON): if revoke fails, the JSON remains so
  // the user can retry. Conversely if we deleted the JSON first, a failed revoke would
  // leave orphaned published artifacts with no way to revoke them from this API.
  if (got.resume.published?.slug) {
    await revokePublished({
      publishedBucket: config.publishedBucket,
      distributionId: config.cloudfrontDistId,
      slug: got.resume.published.slug,
    });
  }

  await deleteResumeObjects({
    bucket: config.storageBucket,
    customId: user.customId,
    resumeId,
  });

  return noContent();
};
