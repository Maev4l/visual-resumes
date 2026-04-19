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
