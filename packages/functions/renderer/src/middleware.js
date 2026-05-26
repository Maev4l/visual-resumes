// LWA forwards the API Gateway event's requestContext as a JSON-encoded header.
// Parse once and stash claims on the Hono context so the publish route can read them.
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

// custom:Id scopes all resume reads/writes; publish without it would 500 deep in storage code.
export const requireUser = async (c, next) => {
  const claims = c.get('claims');
  if (!claims?.['custom:Id']) {
    return c.json({ error: 'Unauthorized', message: 'missing custom:Id claim' }, 401);
  }
  c.set('customId', claims['custom:Id']);
  await next();
};

// Mirror of the previous renderer/src/index.js catch block. publish.js throws Errors with
// .name set to 'NotFound' / 'Forbidden'; everything else is a server bug (500).
export const onError = (err, c) => {
  if (err?.name === 'NotFound') return c.json({ error: 'NotFound', message: err.message }, 404);
  if (err?.name === 'Forbidden') return c.json({ error: 'Forbidden', message: err.message }, 403);
  console.error('renderer unhandled error', err);
  return c.json({ error: 'InternalError', message: 'publish failed' }, 500);
};
