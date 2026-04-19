import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SECTION_TYPES, defaultDataFor, sectionTitle, isKnownType } from './section-types.js';

describe('section-types', () => {
  it('exposes all 8 catalog entries in stable order', () => {
    assert.deepEqual(
      SECTION_TYPES.map((t) => t.id),
      ['contact', 'summary', 'experience', 'education', 'skills', 'projects', 'languages', 'certifications']
    );
  });

  it('returns empty defaults for each type', () => {
    assert.deepEqual(defaultDataFor('contact'), { name: '', headline: '', email: '', phone: '', location: '', links: [] });
    assert.deepEqual(defaultDataFor('summary'), { text: '' });
    assert.deepEqual(defaultDataFor('experience'), []);
    assert.deepEqual(defaultDataFor('education'), []);
    assert.deepEqual(defaultDataFor('skills'), []);
    assert.deepEqual(defaultDataFor('projects'), []);
    assert.deepEqual(defaultDataFor('languages'), []);
    assert.deepEqual(defaultDataFor('certifications'), []);
  });

  it('throws on unknown type', () => {
    assert.throws(() => defaultDataFor('bogus'), /unknown section type: bogus/);
  });

  it('sectionTitle prefers customTitle over default', () => {
    assert.equal(sectionTitle({ type: 'experience' }), 'Experience');
    assert.equal(sectionTitle({ type: 'experience', customTitle: 'Work History' }), 'Work History');
  });

  it('sectionTitle falls back to the type id for unknown types', () => {
    assert.equal(sectionTitle({ type: 'bogus' }), 'bogus');
  });

  it('isKnownType distinguishes catalog entries', () => {
    assert.equal(isKnownType('contact'), true);
    assert.equal(isKnownType('bogus'), false);
  });
});
