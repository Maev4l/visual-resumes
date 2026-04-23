import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from './renderer.js';

const META = { name: 'test', description: '', supportsPhoto: true, supportedPaperSizes: ['A4'] };

const templateSource = `<!doctype html>
<html><head><meta charset="utf-8"><!-- CSS_PLACEHOLDER --></head>
<body>
<h1>{{title}}</h1>
{{#each sections}}
  <section data-type="{{type}}">
    <h2>{{sectionTitle this}}</h2>
    {{#ifEquals type "summary"}}{{{markdown data.text}}}{{/ifEquals}}
    {{#ifEquals type "experience"}}
      {{#each data}}
        <div class="entry">
          <h3>{{role}} — {{company}}</h3>
          <span class="dates">{{formatDate startDate}} – {{#if current}}Present{{else}}{{formatDate endDate}}{{/if}}</span>
          {{#each bullets}}<div class="bullet">{{{markdownInline this}}}</div>{{/each}}
        </div>
      {{/each}}
    {{/ifEquals}}
  </section>
{{/each}}
{{#if _photoSrc}}<img src="{{_photoSrc}}" alt="">{{/if}}
</body></html>`;

const css = `.entry { break-inside: avoid; }`;

const fixture = {
  id: 'r1',
  ownerCustomId: 'u1',
  title: 'EN — Developer',
  templateId: 'monaco',
  paperSize: 'A4',
  photoKey: null,
  sections: [
    { id: 's1', type: 'summary', data: { text: 'Senior **backend** engineer.' } },
    {
      id: 's2',
      type: 'experience',
      customTitle: 'Work History',
      data: [
        { company: 'Acme', role: 'Engineer', startDate: '2022-01-01', endDate: '2024-06-01', current: false, bullets: ['Shipped `foo`.'] },
        { company: 'Beta', role: 'Lead',     startDate: '2024-06-01', current: true, bullets: ['Own **auth**.'] },
      ],
    },
  ],
  published: null,
};

describe('renderer (isomorphic)', () => {
  it('renders title, sections, and inlines CSS', () => {
    const render = createRenderer({ templateSource, style: css, meta: META });
    const html = render(fixture);

    assert.match(html, /<h1>EN — Developer<\/h1>/);
    assert.match(html, /<style>\.entry { break-inside: avoid; }<\/style>/);
    assert.match(html, /<section data-type="summary">/);
    assert.match(html, /<h2>Summary<\/h2>/);                    // default title
    assert.match(html, /<h2>Work History<\/h2>/);               // customTitle override
    assert.match(html, /<strong>backend<\/strong>/);            // markdown helper
  });

  it('formats experience dates with dayjs default', () => {
    const render = createRenderer({ templateSource, style: css, meta: META });
    const html = render(fixture);

    assert.match(html, /Jan 2022 – Jun 2024/);
    assert.match(html, /Jun 2024 – Present/);
  });

  it('renders year-only input as just the year (no "January YYYY")', () => {
    const render = createRenderer({ templateSource, style: css, meta: META });
    const yearOnly = {
      ...fixture,
      sections: [{
        id: 's1', type: 'experience',
        data: [{ company: 'Gamma', role: 'Staff', startDate: '2019', endDate: '2021', current: false }],
      }],
    };
    const html = render(yearOnly);
    assert.match(html, /2019 – 2021/);
    assert.doesNotMatch(html, /January 2019|Jan 2019/);
  });

  it('renders bullet markdown inline (no <p> wrapping)', () => {
    const render = createRenderer({ templateSource, style: css, meta: META });
    const html = render(fixture);

    assert.match(html, /<div class="bullet"><code>foo<\/code><\/div>|<div class="bullet">Shipped <code>foo<\/code>\.<\/div>/);
    assert.doesNotMatch(html, /<div class="bullet"><p>/);
  });

  it('no CSS placeholder left over', () => {
    const render = createRenderer({ templateSource, style: css, meta: META });
    const html = render(fixture);
    assert.doesNotMatch(html, /CSS_PLACEHOLDER/);
  });

  it('formats French phone numbers as "+33 X YY YY YY YY"', () => {
    const tpl = `{{formatPhone p}}`;
    const render = createRenderer({ templateSource: tpl, style: '', meta: META });
    assert.equal(render({ p: '+33123456789' }), '+33 1 23 45 67 89');
    assert.equal(render({ p: '+33 123456789' }), '+33 1 23 45 67 89');
    // Non-FR / unrecognised inputs pass through untouched.
    assert.equal(render({ p: '+1 555 0100' }), '+1 555 0100');
    assert.equal(render({ p: '' }), '');
  });

  it('tolerates missing sections array', () => {
    const render = createRenderer({ templateSource, style: css, meta: META });
    const html = render({ ...fixture, sections: undefined });
    assert.match(html, /<h1>EN — Developer<\/h1>/);
  });

  it('hoists contact section to the top regardless of its placement in the array', () => {
    // The "Contact: …" template probe below is inlined into the test template so the
    // assertion targets a deterministic substring shift rather than full HTML ordering.
    const probingSource = `{{#each sections}}<b>{{type}}</b>|{{/each}}`;
    const render = createRenderer({ templateSource: probingSource, style: '', meta: META });
    const withContactLate = {
      ...fixture,
      sections: [
        { id: 's1', type: 'summary', data: { text: '' } },
        { id: 's2', type: 'skills',  data: [] },
        { id: 's3', type: 'contact', data: { name: 'Ada', email: '', phone: '', location: '', links: [] } },
      ],
    };
    const html = render(withContactLate);
    assert.match(html, /<b>contact<\/b>\|<b>summary<\/b>\|<b>skills<\/b>\|/);
  });
});
