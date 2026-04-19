import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newResumeId, newSectionId, SLUG_ALPHABET, SLUG_LENGTH } from './ids.js';

describe('ids', () => {
  it('newResumeId returns a 26-char crockford-base32 ULID', () => {
    const id = newResumeId();
    assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('newSectionId is unique per call and of ULID shape', () => {
    const a = newSectionId();
    const b = newSectionId();
    assert.notEqual(a, b);
    assert.match(a, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('slug alphabet is lowercase alphanumeric length 36', () => {
    assert.equal(SLUG_ALPHABET, '0123456789abcdefghijklmnopqrstuvwxyz');
    assert.equal(SLUG_LENGTH, 12);
  });
});
