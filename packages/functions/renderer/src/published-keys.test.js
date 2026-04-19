import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { publishedKeys } from './published-keys.js';

describe('published-keys', () => {
  it('builds slug-based S3 keys for the two artifacts (html + pdf — photo is embedded inline)', () => {
    assert.deepEqual(publishedKeys('abc123def456'), {
      html: 'resumes/abc123def456.html',
      pdf:  'resumes/abc123def456.pdf',
    });
  });
});
