# Plan 2 — Shared renderer + templates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cross-package rendering library (`packages/shared`) and the first two resume templates (`monaco` single-column, `modern` two-column-with-sidebar). Both the editor SPA (Preview toggle) and the `renderer` Lambda (publish flow) will import this module.

**Architecture:** `packages/shared/` exposes an **isomorphic** core (`renderer.js`, `markdown.js`, `section-types.js`, `schema/`) with zero filesystem imports, plus a Node-only convenience wrapper (`renderer.node.js`) that loads templates from disk. Templates live in `packages/templates/<id>/` as `template.hbs` + `style.css` + `meta.json` + `preview.png`. The HTML output is self-contained: Handlebars renders the body, a marker placeholder in `<head>` gets replaced with an inlined `<style>` block.

**Tech Stack:** Plain JavaScript (ES modules). `handlebars` (rendering), `markdown-it` (restricted markdown subset), `dayjs` (date formatting). Tests via `node --test` (Node 22+, glob-pattern support). No TypeScript.

**Repo this plan runs in:** `visual-resumes`.

**Prerequisites:**
- Plan 1 has run to the extent that `packages/functions/` exists (at least the per-function skeleton). If Plan 1 hasn't been fully applied, at minimum the repo-root `package.json`, `.gitignore`, `.editorconfig`, and `.nvmrc` are in place.

**User conventions honored:**
- Plain JavaScript (no TypeScript).
- `yarn`, not `npm`.
- Strict (exact) versions in `package.json`.
- Fat-arrow functions.
- `dayjs` (not `moment`).
- `packages/shared` has NO `package.json` (imported via relative path); `packages/templates` likewise.

---

## File structure (what this plan creates)

```
packages/
├── shared/
│   ├── schema/
│   │   └── resume.schema.json
│   ├── section-types.js
│   ├── section-types.test.js
│   ├── markdown.js
│   ├── markdown.test.js
│   ├── renderer.js               # isomorphic (no fs/path imports)
│   ├── renderer.test.js
│   ├── renderer.node.js          # Node-only disk loader
│   └── renderer.node.test.js
├── templates/
│   ├── monaco/
│   │   ├── template.hbs
│   │   ├── style.css
│   │   ├── meta.json
│   │   └── preview.png           # placeholder; real screenshot post-MVP
│   └── modern/
│       ├── template.hbs
│       ├── style.css
│       ├── meta.json
│       └── preview.png
└── functions/
    ├── package.json              # skeleton — shared-lib deps only; Plan 3 extends
    ├── yarn.lock                 # generated
    └── eslint.config.js
```

Tests live next to the source (`*.test.js`). They are discovered by `node --test` invoked from `packages/functions/` so that `handlebars`, `markdown-it`, `dayjs` resolve via `packages/functions/node_modules`.

---

### Task 1: Initialize `packages/functions` package.json (minimal) + ESLint

**Files:**
- Create: `packages/functions/package.json`
- Create: `packages/functions/eslint.config.js`
- Create: `packages/functions/.eslintignore`

- [ ] **Step 1: `packages/functions/package.json`** (minimal — Plan 3 extends with aws-sdk + esbuild)

```json
{
  "name": "@visual-resumes/functions",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "eslint .",
    "test": "node --test '../shared/**/*.test.js'"
  },
  "dependencies": {
    "dayjs": "1.11.13",
    "handlebars": "4.7.8",
    "markdown-it": "14.1.0",
    "nanoid": "5.0.9"
  },
  "devDependencies": {
    "eslint": "9.18.0"
  }
}
```

- [ ] **Step 2: `packages/functions/eslint.config.js`**

```javascript
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'arrow-body-style': ['error', 'as-needed'],
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
```

- [ ] **Step 3: Add missing ESLint peer deps**

```bash
cd packages/functions
yarn add --dev --exact @eslint/js@9.18.0 globals@15.14.0
cd ../..
```

Expected: `yarn.lock` created; `package.json` now lists `@eslint/js` and `globals` in `devDependencies`.

- [ ] **Step 4: `packages/functions/.eslintignore`**

```
bin/
dist/
node_modules/
*/bin/
*/dist/
```

- [ ] **Step 5: Install**

Run: `cd packages/functions && yarn install`
Expected: `node_modules/` populated, `yarn.lock` exists.

- [ ] **Step 6: Sanity check ESLint runs without code**

Run: `cd packages/functions && yarn lint`
Expected: exits 0 (no sources yet) or a benign "no files matched" message.

- [ ] **Step 7: Commit**

```bash
git add packages/functions/package.json packages/functions/yarn.lock packages/functions/eslint.config.js packages/functions/.eslintignore
git commit -m "feat(functions): package.json + eslint baseline (shared-lib deps)"
```

---

### Task 2: `packages/shared/schema/resume.schema.json`

**Files:**
- Create: `packages/shared/schema/resume.schema.json`

- [ ] **Step 1: Write the schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Resume",
  "type": "object",
  "required": ["id", "ownerCustomId", "title", "templateId", "paperSize", "sections"],
  "properties": {
    "id": { "type": "string" },
    "ownerCustomId": { "type": "string" },
    "title": { "type": "string", "minLength": 1 },
    "templateId": { "type": "string", "enum": ["monaco", "modern"] },
    "paperSize": { "type": "string", "enum": ["A4", "Letter"] },
    "photoKey": { "type": ["string", "null"] },
    "sections": {
      "type": "array",
      "items": { "$ref": "#/definitions/section" }
    },
    "published": {
      "oneOf": [
        { "type": "null" },
        {
          "type": "object",
          "required": ["slug", "publishedAt"],
          "properties": {
            "slug": { "type": "string", "pattern": "^[0-9a-z]{12}$" },
            "publishedAt": { "type": "string", "format": "date-time" }
          }
        }
      ]
    }
  },
  "definitions": {
    "section": {
      "type": "object",
      "required": ["id", "type", "data"],
      "properties": {
        "id": { "type": "string" },
        "type": {
          "type": "string",
          "enum": ["contact", "summary", "experience", "education", "skills", "projects", "languages", "certifications"]
        },
        "customTitle": { "type": "string" },
        "pageBreakBefore": { "type": "boolean", "default": false },
        "data": {}
      }
    },
    "link":    { "type": "object", "required": ["label", "url"], "properties": { "label": { "type": "string" }, "url": { "type": "string" } } },
    "contact": {
      "type": "object",
      "required": ["name", "email"],
      "properties": {
        "name":     { "type": "string" },
        "email":    { "type": "string" },
        "phone":    { "type": "string" },
        "location": { "type": "string" },
        "links":    { "type": "array", "items": { "$ref": "#/definitions/link" } }
      }
    },
    "summary": { "type": "object", "required": ["text"], "properties": { "text": { "type": "string" } } },
    "experienceEntry": {
      "type": "object",
      "required": ["company", "role", "startDate", "current"],
      "properties": {
        "company":   { "type": "string" },
        "role":      { "type": "string" },
        "location":  { "type": "string" },
        "startDate": { "type": "string", "format": "date" },
        "endDate":   { "type": "string", "format": "date" },
        "current":   { "type": "boolean" },
        "bullets":   { "type": "array", "items": { "type": "string" } }
      }
    },
    "educationEntry": {
      "type": "object",
      "required": ["institution", "degree", "startDate"],
      "properties": {
        "institution": { "type": "string" },
        "degree":      { "type": "string" },
        "field":       { "type": "string" },
        "startDate":   { "type": "string", "format": "date" },
        "endDate":     { "type": "string", "format": "date" },
        "notes":       { "type": "string" }
      }
    },
    "skillGroup":       { "type": "object", "required": ["items"], "properties": { "group": { "type": "string" }, "items": { "type": "array", "items": { "type": "string" } } } },
    "projectEntry":     { "type": "object", "required": ["name", "description"], "properties": { "name": { "type": "string" }, "description": { "type": "string" }, "link": { "type": "string" }, "tech": { "type": "array", "items": { "type": "string" } }, "bullets": { "type": "array", "items": { "type": "string" } } } },
    "languageEntry":    { "type": "object", "required": ["language", "proficiency"], "properties": { "language": { "type": "string" }, "proficiency": { "type": "string" } } },
    "certificationEntry": { "type": "object", "required": ["name", "issuer", "date"], "properties": { "name": { "type": "string" }, "issuer": { "type": "string" }, "date": { "type": "string", "format": "date" }, "link": { "type": "string" } } }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/schema/resume.schema.json
git commit -m "feat(shared): JSON Schema for resume document"
```

---

### Task 3: `packages/shared/section-types.js` — catalog + helpers (with TDD)

**Files:**
- Create: `packages/shared/section-types.test.js`
- Create: `packages/shared/section-types.js`

- [ ] **Step 1: Write the failing test**

```javascript
// packages/shared/section-types.test.js
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
    assert.deepEqual(defaultDataFor('contact'), { name: '', email: '', phone: '', location: '', links: [] });
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
```

- [ ] **Step 2: Run the failing test**

Run: `cd packages/functions && yarn test`
Expected: fails — module not found.

- [ ] **Step 3: Implement `section-types.js`**

```javascript
// packages/shared/section-types.js
export const SECTION_TYPES = [
  { id: 'contact',        defaultTitle: 'Contact' },
  { id: 'summary',        defaultTitle: 'Summary' },
  { id: 'experience',     defaultTitle: 'Experience' },
  { id: 'education',      defaultTitle: 'Education' },
  { id: 'skills',         defaultTitle: 'Skills' },
  { id: 'projects',       defaultTitle: 'Projects' },
  { id: 'languages',      defaultTitle: 'Languages' },
  { id: 'certifications', defaultTitle: 'Certifications' },
];

const EMPTY_DATA = {
  contact:        () => ({ name: '', email: '', phone: '', location: '', links: [] }),
  summary:        () => ({ text: '' }),
  experience:     () => [],
  education:      () => [],
  skills:         () => [],
  projects:       () => [],
  languages:      () => [],
  certifications: () => [],
};

export const defaultDataFor = (type) => {
  const factory = EMPTY_DATA[type];
  if (!factory) throw new Error(`unknown section type: ${type}`);
  return factory();
};

export const isKnownType = (type) => Object.prototype.hasOwnProperty.call(EMPTY_DATA, type);

export const sectionTitle = (section) => {
  if (section.customTitle) return section.customTitle;
  return SECTION_TYPES.find((t) => t.id === section.type)?.defaultTitle ?? section.type;
};
```

- [ ] **Step 4: Rerun tests**

Run: `cd packages/functions && yarn test`
Expected: all `section-types` tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/section-types.js packages/shared/section-types.test.js
git commit -m "feat(shared): section-types catalog + defaults + title helper"
```

---

### Task 4: `packages/shared/markdown.js` — restricted markdown (with TDD)

**Files:**
- Create: `packages/shared/markdown.test.js`
- Create: `packages/shared/markdown.js`

- [ ] **Step 1: Write the failing test**

```javascript
// packages/shared/markdown.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderMarkdownInline } from './markdown.js';

describe('markdown (restricted)', () => {
  it('renders bold and italic', () => {
    const html = renderMarkdown('**bold** and *italic*');
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<em>italic<\/em>/);
  });

  it('renders inline code', () => {
    assert.match(renderMarkdown('use `fetch()`'), /<code>fetch\(\)<\/code>/);
  });

  it('auto-links bare URLs', () => {
    assert.match(renderMarkdown('see https://example.com'), /<a href="https:\/\/example\.com"/);
  });

  it('escapes raw HTML (does not execute it)', () => {
    const html = renderMarkdown('hi <script>alert(1)</script>');
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  it('does NOT render headings (strips #)', () => {
    // Headings are disabled: "# Title" should NOT produce <h1>.
    const html = renderMarkdown('# Not a heading');
    assert.doesNotMatch(html, /<h1>/);
  });

  it('does NOT render images', () => {
    const html = renderMarkdown('![alt](https://example.com/x.png)');
    assert.doesNotMatch(html, /<img/);
  });

  it('renderMarkdownInline does not wrap in <p>', () => {
    const html = renderMarkdownInline('**bold**');
    assert.equal(html, '<strong>bold</strong>');
  });

  it('treats null/undefined input as empty string', () => {
    assert.equal(renderMarkdown(null), '');
    assert.equal(renderMarkdown(undefined), '');
    assert.equal(renderMarkdownInline(null), '');
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `cd packages/functions && yarn test`
Expected: fails — module missing.

- [ ] **Step 3: Implement `markdown.js`**

```javascript
// packages/shared/markdown.js
// Restricted markdown: bold, italic, inline code, links. No headings, tables, images, or raw HTML.
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,        // disables raw HTML
  linkify: true,      // auto-link bare URLs
  breaks: false,
  typographer: false,
});

// Disable unwanted features.
md.disable(['heading', 'table', 'image']);

export const renderMarkdown = (text) => md.render(text ?? '').trim();
export const renderMarkdownInline = (text) => md.renderInline(text ?? '').trim();
```

- [ ] **Step 4: Rerun tests**

Run: `cd packages/functions && yarn test`
Expected: all markdown tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/markdown.js packages/shared/markdown.test.js
git commit -m "feat(shared): restricted markdown renderer (bold/italic/code/links only)"
```

---

### Task 5: `packages/shared/renderer.js` — isomorphic core (with TDD)

**Files:**
- Create: `packages/shared/renderer.test.js`
- Create: `packages/shared/renderer.js`

- [ ] **Step 1: Write the failing test**

```javascript
// packages/shared/renderer.test.js
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
{{#if photoKey}}<img src="./{{published.slug}}.jpg" alt="">{{/if}}
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

  it('tolerates missing sections array', () => {
    const render = createRenderer({ templateSource, style: css, meta: META });
    const html = render({ ...fixture, sections: undefined });
    assert.match(html, /<h1>EN — Developer<\/h1>/);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `cd packages/functions && yarn test`
Expected: fails — module missing.

- [ ] **Step 3: Implement `renderer.js`**

```javascript
// packages/shared/renderer.js
// Isomorphic core: no fs/path imports — runs in browser (Vite) and Node (Lambda).
import Handlebars from 'handlebars';
import dayjs from 'dayjs';
import { renderMarkdown, renderMarkdownInline } from './markdown.js';
import { sectionTitle } from './section-types.js';

const CSS_MARKER = '<!-- CSS_PLACEHOLDER -->';

const registerHelpers = (hbs) => {
  hbs.registerHelper('markdown', (text) => new hbs.SafeString(renderMarkdown(text)));
  hbs.registerHelper('markdownInline', (text) => new hbs.SafeString(renderMarkdownInline(text)));
  hbs.registerHelper('formatDate', (iso, fmt) => {
    if (!iso) return '';
    return dayjs(iso).format(typeof fmt === 'string' ? fmt : 'MMM YYYY');
  });
  hbs.registerHelper('sectionTitle', (section) => sectionTitle(section));
  hbs.registerHelper('ifEquals', function (a, b, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  });
};

const prepareModel = (resume) => ({
  ...resume,
  paperSize: resume.paperSize ?? 'A4',
  sections: resume.sections ?? [],
});

const inlineCss = (html, style) => html.replace(CSS_MARKER, `<style>${style}</style>`);

export const createRenderer = ({ templateSource, style, meta }) => {
  const hbs = Handlebars.create();
  registerHelpers(hbs);
  const template = hbs.compile(templateSource, { noEscape: false });
  // `meta` is captured so template authors can conditionally branch on e.g. supportsPhoto.
  return (resume) => inlineCss(template({ ...prepareModel(resume), _meta: meta }), style);
};
```

- [ ] **Step 4: Rerun tests**

Run: `cd packages/functions && yarn test`
Expected: all renderer tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/renderer.js packages/shared/renderer.test.js
git commit -m "feat(shared): isomorphic Handlebars renderer with CSS inlining"
```

---

### Task 6: `packages/shared/renderer.node.js` — disk loader (with TDD)

**Files:**
- Create: `packages/shared/renderer.node.test.js`
- Create: `packages/shared/renderer.node.js`

- [ ] **Step 1: Write the failing test**

```javascript
// packages/shared/renderer.node.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadTemplate, renderFromDisk } from './renderer.node.js';

let tmpRoot;

const TEMPLATE_SRC = `<!doctype html><html><head><!-- CSS_PLACEHOLDER --></head><body><h1>{{title}}</h1></body></html>`;
const CSS = `body { color: red; }`;
const META = { name: 'fake', description: '', supportsPhoto: false, supportedPaperSizes: ['A4'] };

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-renderer-'));
  const dir = path.join(tmpRoot, 'fake');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'template.hbs'), TEMPLATE_SRC);
  fs.writeFileSync(path.join(dir, 'style.css'), CSS);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(META));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('renderer.node', () => {
  it('loadTemplate returns parts', () => {
    const { templateSource, style, meta } = loadTemplate(tmpRoot, 'fake');
    assert.equal(templateSource, TEMPLATE_SRC);
    assert.equal(style, CSS);
    assert.deepEqual(meta, META);
  });

  it('renderFromDisk produces CSS-inlined HTML', () => {
    const html = renderFromDisk({
      templatesDir: tmpRoot,
      resume: { id: 'r', ownerCustomId: 'u', title: 'Hello', templateId: 'fake', paperSize: 'A4', sections: [] },
    });
    assert.match(html, /<h1>Hello<\/h1>/);
    assert.match(html, /<style>body { color: red; }<\/style>/);
  });

  it('throws with a useful error when template is missing', () => {
    assert.throws(
      () => loadTemplate(tmpRoot, 'does-not-exist'),
      /does-not-exist/
    );
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `cd packages/functions && yarn test`
Expected: fails — module missing.

- [ ] **Step 3: Implement `renderer.node.js`**

```javascript
// packages/shared/renderer.node.js
// Node-only convenience wrappers around the isomorphic core.
import fs from 'node:fs';
import path from 'node:path';
import { createRenderer } from './renderer.js';

export const loadTemplate = (templatesDir, templateId) => {
  const dir = path.join(templatesDir, templateId);
  const read = (f) => {
    try {
      return fs.readFileSync(path.join(dir, f), 'utf8');
    } catch (err) {
      throw new Error(`Failed to load ${f} for template "${templateId}" under ${templatesDir}: ${err.message}`);
    }
  };
  return {
    templateSource: read('template.hbs'),
    style:          read('style.css'),
    meta:           JSON.parse(read('meta.json')),
  };
};

export const renderFromDisk = ({ templatesDir, resume }) => {
  const parts = loadTemplate(templatesDir, resume.templateId);
  return createRenderer(parts)(resume);
};
```

- [ ] **Step 4: Rerun tests**

Run: `cd packages/functions && yarn test`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/renderer.node.js packages/shared/renderer.node.test.js
git commit -m "feat(shared): Node-only disk loader for templates"
```

---

### Task 7: Template `monaco` (single-column)

**Files:**
- Create: `packages/templates/monaco/template.hbs`
- Create: `packages/templates/monaco/style.css`
- Create: `packages/templates/monaco/meta.json`
- Create: `packages/templates/monaco/preview.png` (1×1 placeholder; real screenshot post-MVP)

- [ ] **Step 1: `packages/templates/monaco/meta.json`**

```json
{
  "name": "Monaco",
  "description": "Single-column classic CV. Clean serifs, understated.",
  "supportsPhoto": true,
  "supportedPaperSizes": ["A4", "Letter"],
  "previewPng": "preview.png"
}
```

- [ ] **Step 2: `packages/templates/monaco/template.hbs`**

```handlebars
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>{{title}}</title>
    <!-- CSS_PLACEHOLDER -->
    <script>
      // Optional photo-hide toggle via ?picture=false
      (() => {
        try {
          const p = new URLSearchParams(location.search);
          if (p.get('picture') === 'false') document.documentElement.classList.add('no-photo');
        } catch (_) {}
      })();
    </script>
  </head>
  <body class="tpl-monaco paper-{{paperSize}}">
    <main class="sheet">
      {{#each sections}}
        {{#if pageBreakBefore}}<div class="page-break"></div>{{/if}}

        {{#ifEquals type "contact"}}
          <header class="contact section">
            <h1 class="name">{{data.name}}</h1>
            <ul class="contact-list">
              {{#if data.email}}<li><a href="mailto:{{data.email}}">{{data.email}}</a></li>{{/if}}
              {{#if data.phone}}<li>{{data.phone}}</li>{{/if}}
              {{#if data.location}}<li>{{data.location}}</li>{{/if}}
              {{#each data.links}}<li><a href="{{url}}">{{label}}</a></li>{{/each}}
            </ul>
            {{#if ../photoKey}}{{#if _meta.supportsPhoto}}
              <img class="photo" src="./{{../published.slug}}.jpg" alt="" />
            {{/if}}{{/if}}
          </header>
        {{/ifEquals}}

        {{#ifEquals type "summary"}}
          <section class="section summary">
            <h2>{{sectionTitle this}}</h2>
            <div class="body">{{{markdown data.text}}}</div>
          </section>
        {{/ifEquals}}

        {{#ifEquals type "experience"}}
          <section class="section experience">
            <h2>{{sectionTitle this}}</h2>
            {{#each data}}
              {{#if pageBreakBefore}}<div class="page-break"></div>{{/if}}
              <article class="entry">
                <header>
                  <h3 class="role-company">{{role}} — {{company}}</h3>
                  <span class="dates">
                    {{formatDate startDate}} – {{#if current}}Present{{else}}{{formatDate endDate}}{{/if}}
                  </span>
                  {{#if location}}<span class="location">{{location}}</span>{{/if}}
                </header>
                {{#if bullets.length}}
                  <ul class="bullets">
                    {{#each bullets}}<li>{{{markdownInline this}}}</li>{{/each}}
                  </ul>
                {{/if}}
              </article>
            {{/each}}
          </section>
        {{/ifEquals}}

        {{#ifEquals type "education"}}
          <section class="section education">
            <h2>{{sectionTitle this}}</h2>
            {{#each data}}
              <article class="entry">
                <h3 class="institution">{{institution}}</h3>
                <div class="degree">{{degree}}{{#if field}}, {{field}}{{/if}}</div>
                <span class="dates">{{formatDate startDate}} – {{formatDate endDate}}</span>
                {{#if notes}}<p class="notes">{{{markdownInline notes}}}</p>{{/if}}
              </article>
            {{/each}}
          </section>
        {{/ifEquals}}

        {{#ifEquals type "skills"}}
          <section class="section skills">
            <h2>{{sectionTitle this}}</h2>
            <ul class="skill-groups">
              {{#each data}}
                <li>
                  {{#if group}}<strong>{{group}}:</strong>{{/if}}
                  {{#each items}}<span class="skill">{{this}}</span>{{#unless @last}}, {{/unless}}{{/each}}
                </li>
              {{/each}}
            </ul>
          </section>
        {{/ifEquals}}

        {{#ifEquals type "projects"}}
          <section class="section projects">
            <h2>{{sectionTitle this}}</h2>
            {{#each data}}
              <article class="entry">
                <h3 class="project-name">
                  {{#if link}}<a href="{{link}}">{{name}}</a>{{else}}{{name}}{{/if}}
                </h3>
                <p class="description">{{{markdownInline description}}}</p>
                {{#if tech.length}}
                  <p class="tech">{{#each tech}}<span>{{this}}</span>{{#unless @last}} · {{/unless}}{{/each}}</p>
                {{/if}}
                {{#if bullets.length}}
                  <ul class="bullets">{{#each bullets}}<li>{{{markdownInline this}}}</li>{{/each}}</ul>
                {{/if}}
              </article>
            {{/each}}
          </section>
        {{/ifEquals}}

        {{#ifEquals type "languages"}}
          <section class="section languages">
            <h2>{{sectionTitle this}}</h2>
            <ul class="language-list">
              {{#each data}}<li><strong>{{language}}</strong> — {{proficiency}}</li>{{/each}}
            </ul>
          </section>
        {{/ifEquals}}

        {{#ifEquals type "certifications"}}
          <section class="section certifications">
            <h2>{{sectionTitle this}}</h2>
            <ul>
              {{#each data}}
                <li>
                  {{#if link}}<a href="{{link}}">{{name}}</a>{{else}}{{name}}{{/if}}
                  — {{issuer}} ({{formatDate date "YYYY"}})
                </li>
              {{/each}}
            </ul>
          </section>
        {{/ifEquals}}
      {{/each}}
    </main>
  </body>
</html>
```

- [ ] **Step 3: `packages/templates/monaco/style.css`**

```css
/* Monaco — single-column CV */

:root {
  --body-font: "Georgia", "Source Serif Pro", serif;
  --heading-font: "Georgia", "Source Serif Pro", serif;
  --accent: #2b2b2b;
  --muted: #666;
  --rule: #d8d8d8;
  --text: #1a1a1a;
}

* { box-sizing: border-box; }

html, body { margin: 0; padding: 0; color: var(--text); font-family: var(--body-font); font-size: 10pt; line-height: 1.45; }

.sheet { max-width: 19cm; margin: 0 auto; padding: 0; }

.section { margin: 0 0 1.25em; }
.section h2 { font-family: var(--heading-font); font-size: 13pt; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid var(--rule); margin: 0 0 0.5em; padding-bottom: 0.15em; break-after: avoid; }

.contact { display: grid; grid-template-columns: 1fr auto; gap: 0.5em 1em; align-items: start; }
.contact .name { font-size: 22pt; margin: 0; font-weight: 700; }
.contact .photo { width: 80px; height: 80px; object-fit: cover; border-radius: 4px; grid-row: 1 / span 2; justify-self: end; }
.no-photo .contact .photo { display: none; }
.contact-list { list-style: none; padding: 0; margin: 0; color: var(--muted); display: flex; flex-wrap: wrap; gap: 0 1em; }

.entry { margin: 0 0 0.75em; break-inside: avoid; }
.entry header { display: flex; flex-wrap: wrap; gap: 0.3em 0.75em; align-items: baseline; }
.entry .role-company, .entry .institution, .entry .project-name { margin: 0; font-size: 11pt; font-weight: 700; }
.entry .dates { color: var(--muted); font-variant-numeric: tabular-nums; }
.entry .location { color: var(--muted); font-style: italic; }
.entry .degree { color: var(--muted); margin: 0.15em 0; }
.entry .description { margin: 0.25em 0; }
.entry .tech { color: var(--muted); font-size: 9pt; margin: 0.15em 0; }

.bullets { margin: 0.3em 0 0; padding-left: 1.1em; }
.bullets li { margin: 0.15em 0; break-inside: avoid; }

.skill-groups { list-style: none; padding: 0; margin: 0; }
.skill-groups li { margin: 0.25em 0; }

.language-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0 1.25em; }

a { color: inherit; text-decoration: underline; }

.page-break { break-before: always; }

@page { size: A4; margin: 14mm; }
.paper-Letter { /* honored at render time in renderer Lambda via @page override */ }
```

- [ ] **Step 4: `packages/templates/monaco/preview.png`**

Create a 1×1 transparent PNG placeholder (it will be replaced by a real screenshot after first publish).

Run:
```bash
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82' > packages/templates/monaco/preview.png
```
Expected: a ~70-byte file.

- [ ] **Step 5: Commit**

```bash
git add packages/templates/monaco
git commit -m "feat(templates): monaco (single-column classic)"
```

---

### Task 8: Template `modern` (two-column with sidebar)

**Files:**
- Create: `packages/templates/modern/template.hbs`
- Create: `packages/templates/modern/style.css`
- Create: `packages/templates/modern/meta.json`
- Create: `packages/templates/modern/preview.png`

- [ ] **Step 1: `packages/templates/modern/meta.json`**

```json
{
  "name": "Modern",
  "description": "Two-column with sidebar for contact + skills. Sans-serif, compact.",
  "supportsPhoto": true,
  "supportedPaperSizes": ["A4", "Letter"],
  "previewPng": "preview.png"
}
```

- [ ] **Step 2: `packages/templates/modern/template.hbs`**

```handlebars
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>{{title}}</title>
    <!-- CSS_PLACEHOLDER -->
    <script>
      (() => {
        try {
          const p = new URLSearchParams(location.search);
          if (p.get('picture') === 'false') document.documentElement.classList.add('no-photo');
        } catch (_) {}
      })();
    </script>
  </head>
  <body class="tpl-modern paper-{{paperSize}}">
    <main class="sheet">
      <aside class="sidebar">
        {{#each sections}}
          {{#ifEquals type "contact"}}
            <div class="contact">
              {{#if ../photoKey}}{{#if _meta.supportsPhoto}}
                <img class="photo" src="./{{../published.slug}}.jpg" alt="" />
              {{/if}}{{/if}}
              <h1 class="name">{{data.name}}</h1>
              <ul>
                {{#if data.email}}<li>{{data.email}}</li>{{/if}}
                {{#if data.phone}}<li>{{data.phone}}</li>{{/if}}
                {{#if data.location}}<li>{{data.location}}</li>{{/if}}
                {{#each data.links}}<li><a href="{{url}}">{{label}}</a></li>{{/each}}
              </ul>
            </div>
          {{/ifEquals}}

          {{#ifEquals type "skills"}}
            <section class="section skills">
              <h2>{{sectionTitle this}}</h2>
              {{#each data}}
                <div class="skill-group">
                  {{#if group}}<h3>{{group}}</h3>{{/if}}
                  <p>{{#each items}}{{this}}{{#unless @last}} · {{/unless}}{{/each}}</p>
                </div>
              {{/each}}
            </section>
          {{/ifEquals}}

          {{#ifEquals type "languages"}}
            <section class="section languages">
              <h2>{{sectionTitle this}}</h2>
              <ul>{{#each data}}<li><strong>{{language}}</strong> — {{proficiency}}</li>{{/each}}</ul>
            </section>
          {{/ifEquals}}
        {{/each}}
      </aside>

      <article class="main-column">
        {{#each sections}}
          {{#if pageBreakBefore}}<div class="page-break"></div>{{/if}}

          {{#ifEquals type "summary"}}
            <section class="section summary">
              <h2>{{sectionTitle this}}</h2>
              <div class="body">{{{markdown data.text}}}</div>
            </section>
          {{/ifEquals}}

          {{#ifEquals type "experience"}}
            <section class="section experience">
              <h2>{{sectionTitle this}}</h2>
              {{#each data}}
                {{#if pageBreakBefore}}<div class="page-break"></div>{{/if}}
                <article class="entry">
                  <header>
                    <h3>{{role}} <span class="at">@ {{company}}</span></h3>
                    <span class="dates">{{formatDate startDate}} – {{#if current}}Present{{else}}{{formatDate endDate}}{{/if}}</span>
                    {{#if location}}<span class="location">{{location}}</span>{{/if}}
                  </header>
                  {{#if bullets.length}}
                    <ul class="bullets">{{#each bullets}}<li>{{{markdownInline this}}}</li>{{/each}}</ul>
                  {{/if}}
                </article>
              {{/each}}
            </section>
          {{/ifEquals}}

          {{#ifEquals type "education"}}
            <section class="section education">
              <h2>{{sectionTitle this}}</h2>
              {{#each data}}
                <article class="entry">
                  <h3>{{degree}}{{#if field}}, {{field}}{{/if}}</h3>
                  <span class="institution">{{institution}}</span>
                  <span class="dates">{{formatDate startDate}} – {{formatDate endDate}}</span>
                  {{#if notes}}<p class="notes">{{{markdownInline notes}}}</p>{{/if}}
                </article>
              {{/each}}
            </section>
          {{/ifEquals}}

          {{#ifEquals type "projects"}}
            <section class="section projects">
              <h2>{{sectionTitle this}}</h2>
              {{#each data}}
                <article class="entry">
                  <h3>{{#if link}}<a href="{{link}}">{{name}}</a>{{else}}{{name}}{{/if}}</h3>
                  <p>{{{markdownInline description}}}</p>
                  {{#if tech.length}}<p class="tech">{{#each tech}}{{this}}{{#unless @last}} · {{/unless}}{{/each}}</p>{{/if}}
                  {{#if bullets.length}}<ul class="bullets">{{#each bullets}}<li>{{{markdownInline this}}}</li>{{/each}}</ul>{{/if}}
                </article>
              {{/each}}
            </section>
          {{/ifEquals}}

          {{#ifEquals type "certifications"}}
            <section class="section certifications">
              <h2>{{sectionTitle this}}</h2>
              <ul>
                {{#each data}}
                  <li>{{#if link}}<a href="{{link}}">{{name}}</a>{{else}}{{name}}{{/if}} — {{issuer}} ({{formatDate date "YYYY"}})</li>
                {{/each}}
              </ul>
            </section>
          {{/ifEquals}}
        {{/each}}
      </article>
    </main>
  </body>
</html>
```

- [ ] **Step 3: `packages/templates/modern/style.css`**

```css
/* Modern — two-column with sidebar */

:root {
  --body-font: "Inter", "Helvetica Neue", Arial, sans-serif;
  --accent: #0b4f6c;
  --accent-soft: #e8f0f3;
  --muted: #555;
  --text: #111;
}

* { box-sizing: border-box; }

html, body { margin: 0; padding: 0; color: var(--text); font-family: var(--body-font); font-size: 10pt; line-height: 1.45; }

.sheet { display: grid; grid-template-columns: 6.5cm 1fr; gap: 0; max-width: 21cm; margin: 0 auto; min-height: 27.5cm; }

.sidebar { background: var(--accent-soft); padding: 16mm 10mm; }
.sidebar .photo { width: 100%; max-width: 130px; aspect-ratio: 1; object-fit: cover; border-radius: 6px; display: block; margin: 0 auto 0.75em; }
.no-photo .sidebar .photo { display: none; }
.sidebar .name { margin: 0 0 0.3em; font-size: 16pt; color: var(--accent); }
.sidebar ul { list-style: none; padding: 0; margin: 0 0 1em; }
.sidebar li { margin: 0.15em 0; color: var(--muted); word-break: break-word; }
.sidebar .section h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent); border-bottom: 1px solid var(--accent); padding-bottom: 0.2em; margin: 0.8em 0 0.4em; break-after: avoid; }
.sidebar .skill-group h3 { font-size: 9pt; text-transform: uppercase; color: var(--muted); margin: 0.4em 0 0.1em; }
.sidebar .skill-group p { margin: 0; }

.main-column { padding: 16mm 12mm; }
.main-column .section { margin: 0 0 1em; }
.main-column .section h2 { font-size: 14pt; color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 0.2em; margin: 0 0 0.5em; break-after: avoid; }

.entry { margin: 0 0 0.75em; break-inside: avoid; }
.entry header { display: grid; grid-template-columns: 1fr auto; gap: 0 0.75em; align-items: baseline; }
.entry h3 { margin: 0; font-size: 11pt; font-weight: 700; }
.entry h3 .at { color: var(--muted); font-weight: 400; }
.entry .dates { color: var(--muted); font-variant-numeric: tabular-nums; }
.entry .location { color: var(--muted); font-size: 9pt; grid-column: 1 / -1; }

.bullets { margin: 0.3em 0 0; padding-left: 1.1em; }
.bullets li { margin: 0.15em 0; break-inside: avoid; }

.tech { color: var(--muted); font-size: 9pt; margin: 0.15em 0; }

a { color: var(--accent); text-decoration: underline; }

.page-break { break-before: always; }

@page { size: A4; margin: 0; }
```

- [ ] **Step 4: `packages/templates/modern/preview.png`**

Same 1×1 placeholder approach as `monaco`:

Run:
```bash
cp packages/templates/monaco/preview.png packages/templates/modern/preview.png
```

- [ ] **Step 5: Commit**

```bash
git add packages/templates/modern
git commit -m "feat(templates): modern (two-column sidebar)"
```

---

### Task 9: End-to-end render smoke test (both templates)

**Files:**
- Create: `packages/shared/templates.e2e.test.js`

This test uses real on-disk templates + a realistic fixture to guard against regressions when template or renderer changes land.

- [ ] **Step 1: Write the test**

```javascript
// packages/shared/templates.e2e.test.js
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
      data: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '+33 1 23', location: 'Paris', links: [{ label: 'GitHub', url: 'https://github.com/ada' }] },
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

for (const templateId of ['monaco', 'modern']) {
  describe(`template: ${templateId}`, () => {
    const html = renderFromDisk({ templatesDir, resume: { ...fixture, templateId } });

    it('is a full HTML document', () => {
      assert.match(html, /^<!doctype html>/i);
      assert.match(html, /<html/);
      assert.match(html, /<\/html>/);
    });

    it('inlines the CSS', () => {
      assert.match(html, /<style>[^<]*<\/style>/);
      assert.doesNotMatch(html, /CSS_PLACEHOLDER/);
    });

    it('renders the name and a link', () => {
      assert.match(html, /Ada Lovelace/);
      assert.match(html, /https:\/\/github\.com\/ada/);
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
```

- [ ] **Step 2: Run**

Run: `cd packages/functions && yarn test`
Expected: all tests pass, including both templates' e2e blocks.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/templates.e2e.test.js
git commit -m "test(shared): e2e render of both templates from disk"
```

---

### Task 10: Lint + final green

**Files:** none.

- [ ] **Step 1: Lint**

Run: `cd packages/functions && yarn lint`
Expected: PASS. If ESLint errors on `../shared/**`, extend `.eslintignore` or the eslint config's `files:` pattern to include `../shared/**/*.js`. Alternatively, symlink or copy the eslint config into `packages/shared/` — but simpler is extending the `files:` glob to walk up.

Add to `packages/functions/eslint.config.js` the following block (if not already wide enough):

```javascript
{
  files: ['../shared/**/*.js'],
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
    globals: { ...globals.node },
  },
},
```

Re-run `yarn lint`. Expected: PASS.

- [ ] **Step 2: Test**

Run: `cd packages/functions && yarn test`
Expected: all tests pass.

- [ ] **Step 3: Commit any lint adjustments**

```bash
git add -u
git commit -m "chore(functions): eslint config covers shared package" --allow-empty
```

---

### Task 11: Self-review

**Files:** none.

- [ ] **Step 1: Spec coverage (re-read spec sections "Templates" + "Data model → Section catalog")**

- [ ] Section catalog has all 8 types (`contact`, `summary`, `experience`, `education`, `skills`, `projects`, `languages`, `certifications`).
- [ ] Markdown subset: bold/italic/code/links only — no headings/tables/images/HTML.
- [ ] Renderer produces self-contained HTML (CSS inlined, photo referenced via relative `./{slug}.jpg`).
- [ ] `@page { size: A4; margin: ... }` in both templates; Letter-size handled by renderer Lambda overriding `@page size` at publish time (covered in Plan 5).
- [ ] Page-break classes (`.page-break`, `break-inside: avoid` on `.section` and `.entry`) present in both templates.
- [ ] Picture toggle via `?picture=false` embedded as tiny inline script in both `template.hbs` files.
- [ ] Isomorphic core has zero `fs`/`path` imports (only `renderer.node.js` reads disk).
- [ ] `renderer.node.js`'s `loadTemplate` error message includes the template id — helps Plan 5 debugging.
- [ ] Consumers (Vite for editor, Lambda for renderer) need no code changes in shared to add a new template — just drop in `packages/templates/<id>/`.

- [ ] **Step 2: Intentional deferrals**
- Real `preview.png` screenshots — captured post-first-publish, out of MVP.
- A third template — deferrable per spec.
- Validation against `resume.schema.json` — Plan 3 consumes the schema in the api Lambda for 400 responses.

---

## Self-review checklist

- [ ] No package.json in `packages/shared` or `packages/templates` (matches spec).
- [ ] `packages/functions/package.json` carries the shared-lib deps with **exact** version strings (no `^`/`~`).
- [ ] All 4 unit-test files + 1 e2e test file pass.
- [ ] Markdown renderer blocks `<script>` and raw HTML.
- [ ] Handlebars helpers: `markdown`, `markdownInline`, `formatDate`, `sectionTitle`, `ifEquals`.
- [ ] Templates do NOT reference any dependency beyond Handlebars + helpers — a future new template needs only `template.hbs` + `style.css` + `meta.json` + `preview.png`.
- [ ] `break-inside: avoid` on `.section` and `.entry` so pagination doesn't split entries mid-flow.
- [ ] `./{slug}.jpg` is the photo reference path (same-directory under `/resumes/` at publish time).

## Out of scope

- Real preview screenshots.
- Editor's UI consumption (Plan 6) — it will use Vite's `?raw` imports to bundle the same templates.
- PDF generation (Plan 5).
- Schema validation (Plan 3 wires `ajv` against `resume.schema.json` in the api Lambda).
