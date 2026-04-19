import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractUser, MissingClaimError } from './auth.js';

const evt = (claims) => ({ requestContext: { authorizer: { jwt: { claims } } } });

describe('auth', () => {
  it('returns { customId, sub, email } from the JWT claims', () => {
    const user = extractUser(evt({ 'custom:Id': 'ABC', sub: 'uuid', email: 'a@b.c' }));
    assert.deepEqual(user, { customId: 'ABC', sub: 'uuid', email: 'a@b.c' });
  });

  it('throws MissingClaimError when custom:Id is absent', () => {
    assert.throws(
      () => extractUser(evt({ sub: 'uuid' })),
      (err) => err instanceof MissingClaimError && /custom:Id/.test(err.message),
    );
  });

  it('throws when there is no authorizer context at all', () => {
    assert.throws(() => extractUser({}), MissingClaimError);
  });
});
