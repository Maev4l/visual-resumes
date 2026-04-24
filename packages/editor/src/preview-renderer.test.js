import { describe, it, expect } from 'vitest';
import { renderPreviewHtml } from './preview-renderer';

// Minimal resume the shared renderer will accept. `monaco` is one of the bundled
// templates; its .hbs + .css ship with the editor, so the test runs against the
// real renderer rather than a mock.
const resume = () => ({
  id: 'R1',
  ownerCustomId: 'U1',
  title: 'Test',
  templateId: 'monaco',
  paperSize: 'A4',
  photoKey: null,
  sections: [
    { id: 'c1', type: 'contact', data: { name: 'Ada Lovelace', headline: '', email: '', phone: '', location: '', links: [] } },
  ],
  published: null,
});

describe('renderPreviewHtml', () => {
  it('returns an HTML document for a known template', () => {
    const html = renderPreviewHtml(resume());
    expect(html).toMatch(/<\/body>/);
    expect(html).toContain('Ada Lovelace');
  });

  it('throws on an unknown templateId', () => {
    expect(() => renderPreviewHtml({ ...resume(), templateId: 'nope' }))
      .toThrow(/unknown template/);
  });
});
