import { Hono } from 'hono';
import { requestContext, requireUser, onError } from './middleware.js';
import { listResumes } from './routes/list-resumes.js';
import { createResume } from './routes/create-resume.js';
import { getResumeRoute } from './routes/get-resume.js';
import { putResumeRoute } from './routes/put-resume.js';
import { deleteResumeRoute } from './routes/delete-resume.js';
import { photoUploadUrl } from './routes/photo-upload-url.js';
import { revokeRoute } from './routes/revoke.js';

// The publish route lives in the renderer Lambda (different compute shape — needs
// Chromium for PDF); intentionally NOT routed here.
const app = new Hono();

app.use('*', requestContext);
app.use('/api/*', requireUser);
app.onError(onError);
// Default 404 is plain text; preserve the JSON envelope the old router used.
app.notFound((c) => c.json({ error: 'NotFound', message: 'route not found' }, 404));

app.get('/api/resumes', listResumes);
app.post('/api/resumes', createResume);
app.get('/api/resumes/:id', getResumeRoute);
app.put('/api/resumes/:id', putResumeRoute);
app.delete('/api/resumes/:id', deleteResumeRoute);
app.post('/api/resumes/:id/photo', photoUploadUrl);
app.post('/api/resumes/:id/revoke', revokeRoute);

export { app };
