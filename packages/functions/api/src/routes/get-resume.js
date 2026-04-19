// GET /api/resumes/{id} — returns { resume, etag, photoDataUri }. The photoDataUri is
// inlined so the editor can render instantly without a second round-trip.
import { ok, error, withEtag } from '../lib/http.js';
import { extractUser } from '../lib/auth.js';
import { getResume, loadPhotoDataUri } from '../lib/storage-private.js';
import { config } from '../config.js';

export const getResumeRoute = async (event) => {
  const user = extractUser(event);
  const resumeId = event.pathParameters?.id;
  if (!resumeId) return error(400, 'BadRequest', 'missing id path parameter');

  const got = await getResume({
    bucket: config.storageBucket,
    customId: user.customId,
    resumeId,
  });
  if (!got) return error(404, 'NotFound', `resume ${resumeId} not found`);

  // Defense-in-depth: IAM already scopes S3 access, but guard against any
  // cross-user key-guessing if that scoping ever regressed.
  if (got.resume.ownerCustomId !== user.customId) {
    return error(403, 'Forbidden', 'not your resume');
  }

  // photoDataUri is null when photoKey is unset OR when the file isn't ready yet
  // (upload still being processed by image-resizer). The editor handles both the same way.
  const photoDataUri = got.resume.photoKey
    ? await loadPhotoDataUri({
        bucket: config.storageBucket,
        customId: user.customId,
        resumeId,
      })
    : null;

  return withEtag(ok({ resume: got.resume, etag: got.etag, photoDataUri }), got.etag);
};
