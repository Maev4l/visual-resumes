// Catalog of supported section types + helpers for title/default-data lookup.
// WHY: centralising this prevents drift between the editor, the renderer, and the JSON Schema.
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

// Factories (not shared instances) so callers can safely mutate returned objects/arrays.
const EMPTY_DATA = {
  contact:        () => ({ name: '', headline: '', email: '', phone: '', location: '', links: [] }),
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

// Prefer user-authored customTitle; fall back to catalog default; finally echo the raw type
// so unknown/forward-compatible types still render something instead of `undefined`.
export const sectionTitle = (section) => {
  if (section.customTitle) return section.customTitle;
  return SECTION_TYPES.find((t) => t.id === section.type)?.defaultTitle ?? section.type;
};
