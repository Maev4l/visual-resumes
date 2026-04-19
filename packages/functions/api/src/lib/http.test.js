import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ok, created, noContent, error, withEtag, parseBody } from './http.js';

describe('http helpers', () => {
  it('ok returns 200 + JSON body', () => {
    const r = ok({ a: 1 });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(r.body, '{"a":1}');
  });

  it('created returns 201', () => {
    assert.equal(created({}).statusCode, 201);
  });

  it('noContent returns 204 with no body', () => {
    const r = noContent();
    assert.equal(r.statusCode, 204);
    assert.equal(r.body, '');
  });

  it('error returns the requested status + { error: ... }', () => {
    const r = error(404, 'NotFound', 'nope');
    assert.equal(r.statusCode, 404);
    assert.deepEqual(JSON.parse(r.body), { error: 'NotFound', message: 'nope' });
  });

  it('withEtag attaches an ETag header', () => {
    const r = withEtag(ok({}), '"abc"');
    assert.equal(r.headers.etag, '"abc"');
  });

  it('parseBody handles JSON, missing, and invalid', () => {
    assert.deepEqual(parseBody({ body: '{"x":1}' }), { x: 1 });
    assert.deepEqual(parseBody({ body: null }), {});
    assert.deepEqual(parseBody({}), {});
    assert.throws(() => parseBody({ body: '{broken' }), /invalid JSON/);
  });
});
