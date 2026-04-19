import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFromDisk } from './renderer.node.js';

const templatesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

const fixture = {
  id: '01J...',
  ownerCustomId: 'USER1',
  title: 'EN — Senior Engineer',
  paperSize: 'A4',
  photoKey: null,
  published: null,
  sections: [
    {
      id: 's1', type: 'contact',
      data: { name: 'Ada Lovelace', headline: 'Senior Engineer', email: 'ada@example.com', phone: '+33 1 23', location: 'Paris', links: [{ label: 'GitHub', url: 'https://github.com/ada' }] },
    },
    {
      id: 's2', type: 'summary',
      data: { text: 'Senior engineer with **10 years** of experience across `distributed systems` and databases.' },
    },
    {
      id: 's3', type: 'experience',
      data: [
        { company: 'Acme', role: 'Staff Eng', startDate: '2022-01-01', endDate: '2024-06-01', current: false, bullets: ['Shipped the **foo** platform.', 'Scaled `bar` to 1M rps.'], location: 'Remote' },
        { company: 'Beta', role: 'Lead',      startDate: '2024-06-01', current: true,  bullets: ['Own auth.'] },
      ],
    },
    {
      id: 's4', type: 'skills',
      data: [{ group: 'Languages', items: ['JavaScript', 'Go', 'SQL'] }, { group: 'Infra', items: ['AWS', 'Terraform'] }],
    },
    { id: 's5', type: 'languages', data: [{ language: 'English', proficiency: 'C2' }, { language: 'French', proficiency: 'Native' }] },
  ],
  templateId: '',  // per-case
};

for (const templateId of ['monaco', 'modern', 'avant']) {
  describe(`template: ${templateId}`, () => {
    const html = renderFromDisk({ templatesDir, resume: { ...fixture, templateId } });

    it('is a full HTML document', () => {
      assert.match(html, /^<!doctype html>/i);
      assert.match(html, /<html/);
      assert.match(html, /<\/html>/);
    });

    it('inlines the CSS', () => {
      // Match across lines + tolerate `<` inside CSS comments (e.g. a `/* … <div …> … */`).
      // `[\s\S]+?` is the standard dot-all workaround for regex without the `s` flag.
      assert.match(html, /<style>[\s\S]+?<\/style>/);
      assert.doesNotMatch(html, /CSS_PLACEHOLDER/);
    });

    it('renders the name and a link', () => {
      assert.match(html, /Ada Lovelace/);
      assert.match(html, /https:\/\/github\.com\/ada/);
    });

    it('renders the headline', () => {
      assert.match(html, /Senior Engineer/);
    });

    it('renders markdown in the summary', () => {
      assert.match(html, /<strong>10 years<\/strong>/);
      assert.match(html, /<code>distributed systems<\/code>/);
    });

    it('renders experience dates with dayjs defaults', () => {
      assert.match(html, /Jan 2022 – Jun 2024/);
      assert.match(html, /Jun 2024 – Present/);
    });

    it('renders skills groups', () => {
      assert.match(html, /JavaScript/);
      assert.match(html, /Infra|Languages/);
    });
  });
}
