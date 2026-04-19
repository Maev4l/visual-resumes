import { describe, it, expect } from 'vitest';
import { reducer, initialState, actions } from './reducer.js';

// Minimal resume shape the editor will hydrate with. Kept fieldwise aligned with
// the shared section-types catalog so defaults for each section type match.
const blank = {
  id: 'R1', ownerCustomId: 'U1', title: 'EN', templateId: 'monaco',
  paperSize: 'A4', photoKey: null, sections: [], published: null,
};

describe('editor reducer', () => {
  it('hydrate sets resume + etag + clears dirty', () => {
    const s = reducer(initialState, actions.hydrate({ resume: blank, etag: '"e"' }));
    expect(s.resume).toEqual(blank);
    expect(s.etag).toBe('"e"');
    expect(s.dirty).toBe(false);
  });

  it('updateScalar merges and marks dirty', () => {
    const s0 = reducer(initialState, actions.hydrate({ resume: blank, etag: '"e"' }));
    const s1 = reducer(s0, actions.updateScalar({ title: 'FR' }));
    expect(s1.resume.title).toBe('FR');
    expect(s1.dirty).toBe(true);
  });

  it('addSection appends with defaults for type', () => {
    const s0 = reducer(initialState, actions.hydrate({ resume: blank, etag: '"e"' }));
    const s1 = reducer(s0, actions.addSection({ type: 'contact' }));
    expect(s1.resume.sections).toHaveLength(1);
    expect(s1.resume.sections[0].type).toBe('contact');
    // Matches shared section-types EMPTY_DATA.contact — includes headline.
    expect(s1.resume.sections[0].data).toEqual({
      name: '', headline: '', email: '', phone: '', location: '', links: [],
    });
  });

  it('moveSection reorders', () => {
    const seeded = reducer(initialState, actions.hydrate({
      resume: { ...blank, sections: [
        { id: 's1', type: 'summary', data: { text: '' } },
        { id: 's2', type: 'skills',  data: [] },
      ] },
      etag: '"e"',
    }));
    const up = reducer(seeded, actions.moveSection({ id: 's2', direction: 'up' }));
    expect(up.resume.sections.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('removeSection drops by id', () => {
    const seeded = reducer(initialState, actions.hydrate({
      resume: { ...blank, sections: [{ id: 's1', type: 'summary', data: { text: '' } }] },
      etag: '"e"',
    }));
    const out = reducer(seeded, actions.removeSection({ id: 's1' }));
    expect(out.resume.sections).toEqual([]);
  });

  it('updateSectionData replaces data for a section id', () => {
    const seeded = reducer(initialState, actions.hydrate({
      resume: { ...blank, sections: [{ id: 's1', type: 'summary', data: { text: '' } }] },
      etag: '"e"',
    }));
    const out = reducer(seeded, actions.updateSectionData({ id: 's1', data: { text: 'hi' } }));
    expect(out.resume.sections[0].data).toEqual({ text: 'hi' });
  });

  it('setPhotoKey updates photoKey', () => {
    const seeded = reducer(initialState, actions.hydrate({ resume: blank, etag: '"e"' }));
    const out = reducer(seeded, actions.setPhotoKey('users/U1/photos/R1.webp'));
    expect(out.resume.photoKey).toBe('users/U1/photos/R1.webp');
  });

  it('saved keeps resume, clears dirty, updates etag', () => {
    const s0 = reducer(initialState, actions.hydrate({ resume: blank, etag: '"e"' }));
    const s1 = reducer(s0, actions.updateScalar({ title: 'FR' }));
    const s2 = reducer(s1, actions.saved('"e2"'));
    expect(s2.etag).toBe('"e2"');
    expect(s2.dirty).toBe(false);
    expect(s2.resume.title).toBe('FR');
  });
});
