// LWA forwards the API Gateway event's requestContext as a JSON-encoded header.
// Parse once and stash claims on the Hono context so every downstream handler can read them.
export const requestContext = async (c, next) => {
  const raw = c.req.header('x-amzn-request-context');
  if (raw) {
    try {
      const ctx = JSON.parse(raw);
      c.set('claims', ctx?.authorizer?.jwt?.claims ?? null);
    } catch {
      // Malformed header — leave claims unset; requireUser will 401.
    }
  }
  await next();
};

// custom:Id is the per-user partition key for resumes; everything 401s without it.
export const requireUser = async (c, next) => {
  const claims = c.get('claims');
  if (!claims?.['custom:Id']) {
    return c.json({ error: 'Unauthorized', message: 'missing custom:Id claim' }, 401);
  }
  c.set('customId', claims['custom:Id']);
  await next();
};

// Mirror of the previous api/src/index.js catch block. Anything not classified is a server bug (500).
// SyntaxError covers invalid JSON bodies (Hono's c.req.json() throws SyntaxError), replacing
// the old custom InvalidJSON code.
export const onError = (err, c) => {
  if (err?.name === 'SyntaxError') return c.json({ error: 'BadRequest', message: `invalid JSON: ${err.message}` }, 400);
  console.error('unhandled error', err);
  return c.json({ error: 'InternalError', message: 'unexpected error' }, 500);
};
