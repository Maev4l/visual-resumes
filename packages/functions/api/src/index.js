// Lambda entrypoint — dispatch on event.routeKey (API Gateway HTTP-API v2). Single file
// so esbuild can statically analyze the import graph and inline everything into one bundle.
import { error } from './lib/http.js';
import { MissingClaimError } from './lib/auth.js';

import { listResumes } from './routes/list-resumes.js';
import { createResume } from './routes/create-resume.js';
import { getResumeRoute } from './routes/get-resume.js';
import { putResumeRoute } from './routes/put-resume.js';
import { deleteResumeRoute } from './routes/delete-resume.js';
import { photoUploadUrl } from './routes/photo-upload-url.js';
import { revokeRoute } from './routes/revoke.js';

// The publish route lives in the renderer Lambda (different compute shape — needs
// Chromium for PDF); intentionally NOT routed here.
const ROUTES = {
  'GET /api/resumes':              listResumes,
  'POST /api/resumes':             createResume,
  'GET /api/resumes/{id}':         getResumeRoute,
  'PUT /api/resumes/{id}':         putResumeRoute,
  'DELETE /api/resumes/{id}':      deleteResumeRoute,
  'POST /api/resumes/{id}/photo':  photoUploadUrl,
  'POST /api/resumes/{id}/revoke': revokeRoute,
};

export const handler = async (event) => {
  try {
    const route = ROUTES[event.routeKey];
    if (!route) return error(404, 'NotFound', `no route for ${event.routeKey}`);
    return await route(event);
  } catch (err) {
    // Central error-to-HTTP mapping. Anything not matched below is a server bug (500).
    if (err instanceof MissingClaimError) return error(401, 'Unauthorized', err.message);
    if (err?.code === 'InvalidJSON') return error(400, 'BadRequest', err.message);

    console.error('unhandled error', err);
    return error(500, 'InternalError', 'unexpected error');
  }
};
