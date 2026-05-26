import { Hono } from 'hono';
import { requestContext, requireUser, onError } from './middleware.js';
import { publish } from './publish.js';

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
};

// Lazy load the real browser module so tests with RENDERER_DISABLE_CHROMIUM=1 never touch chromium.
const chromiumDisabled = () => process.env.RENDERER_DISABLE_CHROMIUM === '1';
const fakeHtmlToPdfForTests = async (html) => Buffer.from(`PDF:${html.length}`);
const loadHtmlToPdf = async () => {
  if (chromiumDisabled()) return fakeHtmlToPdfForTests;
  const mod = await import('./browser.js');
  return mod.htmlToPdf;
};

const app = new Hono();

app.use('*', requestContext);
app.use('/api/*', requireUser);
app.onError(onError);
app.notFound((c) => c.json({ error: 'NotFound', message: 'route not found' }, 404));

app.post('/api/resumes/:id/publish', async (c) => {
  const customId = c.get('customId');
  const resumeId = c.req.param('id');

  const out = await publish({
    customId,
    resumeId,
    templatesDir:     required('TEMPLATES_DIR'),
    storageBucket:    required('RESUMES_STORAGE_BUCKET'),
    publishedBucket:  required('RESUMES_PUBLISHED_BUCKET'),
    cloudfrontDistId: required('CLOUDFRONT_DIST_ID'),
    htmlToPdf:        await loadHtmlToPdf(),
  });

  // WHY etag header: the editor reads it from response headers (matches put-resume's
  // contract) to rotate state.etag after publish — without it the next autosave 412s.
  if (out.etag) c.header('etag', out.etag);
  return c.json(out);
});

export { app };
