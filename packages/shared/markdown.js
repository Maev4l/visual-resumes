// Restricted markdown renderer: bold, italic, inline code, links only.
// WHY: resumes are short structured documents — allowing headings, tables, images, or raw HTML
// risks users breaking template layout or injecting scripts into published HTML artefacts.
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,        // disables raw HTML (defence-in-depth: also escaped by Handlebars)
  linkify: true,      // auto-link bare URLs (nice-to-have for summary/bullet text)
  breaks: false,
  typographer: false,
});

// Headings/tables/images are not meaningful inside resume prose and would clash with templates.
md.disable(['heading', 'table', 'image']);

export const renderMarkdown = (text) => md.render(text ?? '').trim();
export const renderMarkdownInline = (text) => md.renderInline(text ?? '').trim();
