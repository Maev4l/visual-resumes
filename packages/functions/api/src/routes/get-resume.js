// GET /api/resumes/{id} — returns { resume, etag, photoDataUri }. The photoDataUri is
// inlined so the editor can render instantly without a second round-trip.
import { getResume, loadPhotoDataUri } from '../lib/storage-private.js';
import { config } from '../config.js';

export const getResumeRoute = async (c) => {
  const customId = c.get('customId');
  const resumeId = c.req.param('id');

  const got = await getResume({
    bucket: config.storageBucket,
    customId,
    resumeId,
  });
  if (!got) return c.json({ error: 'NotFound', message: `resume ${resumeId} not found` }, 404);

  // Defense-in-depth: IAM already scopes S3 access, but guard against any
  // cross-user key-guessing if that scoping ever regressed.
  if (got.resume.ownerCustomId !== customId) {
    return c.json({ error: 'Forbidden', message: 'not your resume' }, 403);
  }

  // photoDataUri is null when photoKey is unset OR when the file isn't ready yet
  // (upload still being processed by image-resizer). The editor handles both the same way.
  const photoDataUri = got.resume.photoKey
    ? await loadPhotoDataUri({
        bucket: config.storageBucket,
        customId,
        resumeId,
      })
    : null;

  c.header('etag', got.etag);
  return c.json({ resume: got.resume, etag: got.etag, photoDataUri });
};
