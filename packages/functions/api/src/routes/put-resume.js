// PUT /api/resumes/{id} — IfMatch-gated save. Returns 412 on ETag mismatch so the
// editor can refetch and replay.
import { validateResume } from '../lib/validation.js';
import { putResumeConditional } from '../lib/storage-private.js';
import { config } from '../config.js';

export const putResumeRoute = async (c) => {
  const customId = c.get('customId');
  const resumeId = c.req.param('id');

  // Hono normalizes header names to lowercase.
  const ifMatch = c.req.header('if-match');
  if (!ifMatch) return c.json({ error: 'PreconditionRequired', message: 'If-Match header required' }, 428);

  const body = await c.req.json();
  // Path/body id mismatch would silently overwrite a different resume if the DB layer
  // used the body id — reject explicitly to make the error visible upstream.
  if (body.id && body.id !== resumeId) {
    return c.json({ error: 'BadRequest', message: 'id mismatch between path and body' }, 400);
  }

  const v = validateResume(body);
  if (!v.valid) {
    return c.json({ error: 'ValidationError', message: 'invalid resume payload', errors: v.errors }, 400);
  }

  if (body.ownerCustomId !== customId) {
    return c.json({ error: 'Forbidden', message: 'cannot modify another user\'s resume' }, 403);
  }

  try {
    const { etag } = await putResumeConditional({
      bucket: config.storageBucket,
      customId,
      resumeId,
      resume: body,
      etag: ifMatch,
    });
    c.header('etag', etag);
    return c.json({ etag });
  } catch (err) {
    if (err.name === 'PreconditionFailed') {
      return c.json({ error: 'PreconditionFailed', message: 'ETag mismatch — refetch and retry' }, 412);
    }
    throw err;
  }
};
