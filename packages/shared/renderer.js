// Isomorphic renderer core.
// WHY: no fs/path imports so the same module bundles cleanly in Vite (editor preview) and
// runs unchanged inside the renderer Lambda. Template/CSS/meta are injected by the caller.
import Handlebars from 'handlebars';
import dayjs from 'dayjs';
import { renderMarkdown, renderMarkdownInline } from './markdown.js';
import { sectionTitle } from './section-types.js';

const CSS_MARKER = '<!-- CSS_PLACEHOLDER -->';

// Helpers are registered on a fresh Handlebars instance per renderer so templates
// authored with different helper conventions cannot leak into one another.
const registerHelpers = (hbs) => {
  hbs.registerHelper('markdown', (text) => new hbs.SafeString(renderMarkdown(text)));
  hbs.registerHelper('markdownInline', (text) => new hbs.SafeString(renderMarkdownInline(text)));
  // Formats a phone number for display. French numbers (+33 followed by 9 digits) get
  // the canonical "+33 X YY YY YY YY" grouping. Everything else passes through unchanged
  // so authors can hand-format numbers from other countries however they like.
  hbs.registerHelper('formatPhone', (raw) => {
    if (!raw) return '';
    const compact = String(raw).replace(/\s+/g, '');
    const m = /^\+33(\d{9})$/.exec(compact);
    if (m) {
      const d = m[1];
      return `+33 ${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
    }
    return raw;
  });
  hbs.registerHelper('formatDate', (iso, fmt) => {
    if (!iso) return '';
    // Year-only input (`2024`) renders as just the year regardless of the caller's
    // requested format. Authors who only know the year shouldn't have their input
    // silently promoted to "January 2024".
    if (/^\d{4}$/.test(iso)) return iso;
    // WHY `typeof fmt === 'string'`: Handlebars passes an options object as last arg when no
    // format is supplied, so we must reject non-strings to avoid formatting with junk.
    return dayjs(iso).format(typeof fmt === 'string' ? fmt : 'MMM YYYY');
  });
  hbs.registerHelper('sectionTitle', (section) => sectionTitle(section));
  // Traditional function (not fat arrow) because Handlebars needs `this` from the block scope.
  hbs.registerHelper('ifEquals', function (a, b, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  });
};

// Ensure the template always sees an array for {{#each sections}} regardless of caller shape.
// Contact is the resume's masthead — always hoist it to index 0 so templates don't need
// to know or care where the author placed it in the editor. Any other ordering stands.
const prepareModel = (resume) => {
  const sections = resume.sections ?? [];
  const contactIdx = sections.findIndex((s) => s.type === 'contact');
  const ordered = contactIdx > 0
    ? [sections[contactIdx], ...sections.slice(0, contactIdx), ...sections.slice(contactIdx + 1)]
    : sections;
  return {
    ...resume,
    paperSize: resume.paperSize ?? 'A4',
    sections: ordered,
  };
};

const inlineCss = (html, style) => html.replace(CSS_MARKER, `<style>${style}</style>`);

export const createRenderer = ({ templateSource, style, meta }) => {
  const hbs = Handlebars.create();
  registerHelpers(hbs);
  const template = hbs.compile(templateSource, { noEscape: false });
  // `meta` is exposed as `_meta` so templates can branch on e.g. supportsPhoto without
  // having to know their own identity.
  return (resume) => inlineCss(template({ ...prepareModel(resume), _meta: meta }), style);
};
