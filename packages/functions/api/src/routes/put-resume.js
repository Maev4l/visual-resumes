// PUT /api/resumes/{id} — IfMatch-gated save. Returns 412 on ETag mismatch so the
// editor can refetch and replay.
import { ok, error, parseBody, withEtag } from '../lib/http.js';
import { extractUser } from '../lib/auth.js';
import { validateResume } from '../lib/validation.js';
import { putResumeConditional } from '../lib/storage-private.js';
import { config } from '../config.js';

export const putResumeRoute = async (event) => {
  const user = extractUser(event);
  const resumeId = event.pathParameters?.id;
  if (!resumeId) return error(400, 'BadRequest', 'missing id path parameter');

  // API Gateway lowercases header names but tolerate both for local invocations.
  const ifMatch = event.headers?.['if-match'] ?? event.headers?.['If-Match'];
  if (!ifMatch) return error(428, 'PreconditionRequired', 'If-Match header required');

  const body = parseBody(event);
  // Path/body id mismatch would silently overwrite a different resume if the DB layer
  // used the body id — reject explicitly to make the error visible upstream.
  if (body.id && body.id !== resumeId) {
    return error(400, 'BadRequest', 'id mismatch between path and body');
  }

  const v = validateResume(body);
  if (!v.valid) return error(400, 'ValidationError', 'invalid resume payload', { errors: v.errors });

  if (body.ownerCustomId !== user.customId) {
    return error(403, 'Forbidden', 'cannot modify another user\'s resume');
  }

  try {
    const { etag } = await putResumeConditional({
      bucket: config.storageBucket,
      customId: user.customId,
      resumeId,
      resume: body,
      etag: ifMatch,
    });
    return withEtag(ok({ etag }), etag);
  } catch (err) {
    if (err.name === 'PreconditionFailed') {
      return error(412, 'PreconditionFailed', 'ETag mismatch — refetch and retry');
    }
    throw err;
  }
};
