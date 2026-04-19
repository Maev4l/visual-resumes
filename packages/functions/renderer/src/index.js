import { publish } from './publish.js';

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
};

const chromiumDisabled = () => process.env.RENDERER_DISABLE_CHROMIUM === '1';

const fakeHtmlToPdfForTests = async (html) => Buffer.from(`PDF:${html.length}`);

const response = (statusCode, bodyObject) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(bodyObject),
});

const error = (statusCode, code, message) => response(statusCode, { error: code, message });

const extractUser = (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims || !claims['custom:Id']) {
    const err = new Error('missing custom:Id claim');
    err.code = 'Unauthorized';
    throw err;
  }
  return { customId: claims['custom:Id'] };
};

export const handler = async (event) => {
  try {
    const user = extractUser(event);
    const resumeId = event.pathParameters?.id;
    if (!resumeId) return error(400, 'BadRequest', 'missing id path parameter');

    // Lazy import of the real browser module so tests with RENDERER_DISABLE_CHROMIUM=1 never touch chromium.
    let htmlToPdf;
    if (chromiumDisabled()) {
      htmlToPdf = fakeHtmlToPdfForTests;
    } else {
      ({ htmlToPdf } = await import('./browser.js'));
    }

    const out = await publish({
      customId: user.customId,
      resumeId,
      templatesDir:     required('TEMPLATES_DIR'),
      storageBucket:    required('RESUMES_STORAGE_BUCKET'),
      publishedBucket:  required('RESUMES_PUBLISHED_BUCKET'),
      cloudfrontDistId: required('CLOUDFRONT_DIST_ID'),
      htmlToPdf,
    });

    return response(200, out);
  } catch (err) {
    if (err.code === 'Unauthorized') return error(401, 'Unauthorized', err.message);
    if (err.name === 'NotFound')     return error(404, 'NotFound', err.message);
    if (err.name === 'Forbidden')    return error(403, 'Forbidden', err.message);

    console.error('renderer unhandled error', err);
    return error(500, 'InternalError', 'publish failed');
  }
};
