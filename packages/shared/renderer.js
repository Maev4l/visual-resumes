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
  hbs.registerHelper('formatDate', (iso, fmt) => {
    if (!iso) return '';
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
  // `meta` is exposed as `_meta` so templates can branch on e.g. supportsPhoto without
  // having to know their own identity.
  return (resume) => inlineCss(template({ ...prepareModel(resume), _meta: meta }), style);
};
