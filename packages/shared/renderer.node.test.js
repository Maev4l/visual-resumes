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
