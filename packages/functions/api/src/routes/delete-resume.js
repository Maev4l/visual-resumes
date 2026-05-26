// DELETE /api/resumes/{id} — if the resume was published, also deletes artifacts +
// invalidates CloudFront before removing the source-of-truth JSON.
import { getResume, deleteResumeObjects } from '../lib/storage-private.js';
import { revokePublished } from '../lib/storage-published.js';
import { config } from '../config.js';

export const deleteResumeRoute = async (c) => {
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
    customId,
    resumeId,
  });

  return c.body(null, 204);
};
