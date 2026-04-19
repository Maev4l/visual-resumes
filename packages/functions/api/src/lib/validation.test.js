import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCreate, validateResume } from './validation.js';

describe('validation', () => {
  describe('validateCreate', () => {
    it('accepts valid create body', () => {
      const res = validateCreate({ title: 'EN', templateId: 'monaco', paperSize: 'A4' });
      assert.equal(res.valid, true);
    });

    it('rejects missing title', () => {
      const res = validateCreate({ templateId: 'monaco', paperSize: 'A4' });
      assert.equal(res.valid, false);
      assert.match(JSON.stringify(res.errors), /title/);
    });

    it('rejects unknown template', () => {
      const res = validateCreate({ title: 'X', templateId: 'bogus', paperSize: 'A4' });
      assert.equal(res.valid, false);
    });

    it('rejects unknown paper size', () => {
      const res = validateCreate({ title: 'X', templateId: 'monaco', paperSize: 'Legal' });
      assert.equal(res.valid, false);
    });
  });

  describe('validateResume', () => {
    const base = {
      id: 'R1',
      ownerCustomId: 'U1',
      title: 'EN',
      templateId: 'monaco',
      paperSize: 'A4',
      photoKey: null,
      sections: [],
      published: null,
    };

    it('accepts a minimal resume', () => {
      assert.equal(validateResume(base).valid, true);
    });

    it('rejects unknown section type', () => {
      const bad = { ...base, sections: [{ id: 's1', type: 'bogus', data: {} }] };
      const res = validateResume(bad);
      assert.equal(res.valid, false);
    });
  });
});
