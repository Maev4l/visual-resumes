import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newSlug, SLUG_ALPHABET, SLUG_LENGTH } from './slug.js';

describe('slug', () => {
  it('length is 12, alphabet is 0-9a-z', () => {
    assert.equal(SLUG_LENGTH, 12);
    assert.equal(SLUG_ALPHABET, '0123456789abcdefghijklmnopqrstuvwxyz');
  });

  it('generates 12 chars from the alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const s = newSlug();
      assert.equal(s.length, 12);
      assert.match(s, /^[0-9a-z]{12}$/);
    }
  });

  it('does not collide trivially', () => {
    const set = new Set();
    for (let i = 0; i < 200; i += 1) set.add(newSlug());
    assert.equal(set.size, 200);
  });
});
