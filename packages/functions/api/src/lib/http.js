// HTTP response helpers. Shape matches API Gateway HTTP-API's format v2 Lambda integration.
// WHY kept separate: every route returns JSON via the same envelope; centralizing avoids
// drift on content-type / etag / error shape.
const json = (statusCode, bodyObject, headers = {}) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  body: JSON.stringify(bodyObject),
});

export const ok = (body, headers) => json(200, body, headers);
export const created = (body, headers) => json(201, body, headers);

export const noContent = () => ({ statusCode: 204, headers: {}, body: '' });

export const error = (statusCode, code, message, extra = {}) =>
  json(statusCode, { error: code, message, ...extra });

export const withEtag = (response, etag) => ({
  ...response,
  headers: { ...response.headers, etag },
});

export const parseBody = (event) => {
  if (!event?.body) return {};
  try {
    // API Gateway can base64-encode bodies for binary content-types; tolerate both.
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return JSON.parse(raw);
  } catch (err) {
    const e = new Error(`invalid JSON: ${err.message}`);
    e.code = 'InvalidJSON';
    throw e;
  }
};
