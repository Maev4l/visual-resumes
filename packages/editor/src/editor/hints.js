// packages/editor/src/editor/hints.js
// Per-section, per-field "renders as…" copy. Rendered by <FieldHint> under each
// input label on the Edit page so the author sees how a field will typeset in the
// published document. Text is deliberately terse and template-agnostic — templates
// vary, but the typographic role of each field (headline, metadata, body) is stable.
//
// Use: `HINTS.contact.name` -> string. Missing entries fall back to no hint, not
// an error.
export const HINTS = {
  contact: {
    name:     { text: 'Document headline · serif display',              as: 'serif' },
    headline: { text: 'Supporting line under the name · italic',        as: 'serif' },
    email:    { text: 'contact metadata · mono, right-rail',            as: 'meta'  },
    phone:    { text: 'contact metadata · mono, right-rail',            as: 'meta'  },
    location: { text: 'contact metadata · mono, right-rail',            as: 'meta'  },
    linkLabel:{ text: 'underlined link text · body',                    as: 'sans'  },
    linkUrl:  { text: 'opens in a new tab when the reader clicks',      as: 'meta'  },
  },
  summary: {
    text: { text: 'Leading paragraph · serif body · markdown allowed',  as: 'serif' },
  },
  experience: {
    company:   { text: 'Section header · serif small-caps',             as: 'serif' },
    role:      { text: 'Role title · bold body',                        as: 'sans'  },
    location:  { text: 'Byline · mono, right-rail',                     as: 'meta'  },
    startDate: { text: '"YYYY-MM" → "January 2024"; "YYYY" → "2024"',    as: 'meta'  },
    endDate:   { text: 'or "Present" if current',                       as: 'meta'  },
    body:      { text: 'serif body · paragraphs + nested bullets · markdown', as: 'serif' },
  },
  education: {
    institution: { text: 'Section header · serif small-caps',             as: 'serif' },
    degree:      { text: 'Degree line · bold body',                       as: 'sans'  },
    field:       { text: 'Field of study · italic serif',                 as: 'serif' },
    startDate:   { text: '"YYYY-MM" → "September 2019"; "YYYY" → "2019"',  as: 'meta'  },
    endDate:     { text: 'optional · omit if in progress',                as: 'meta'  },
    notes:       { text: 'optional aside · serif body · markdown allowed',as: 'serif' },
  },
  skills: {
    group: { text: 'Skills group label · serif small-caps',               as: 'serif' },
    items: { text: 'comma-separated run-in list · body',                  as: 'sans'  },
  },
  projects: {
    name:        { text: 'Project title · bold body',                     as: 'sans'  },
    description: { text: 'one-line tagline · italic serif',               as: 'serif' },
    link:        { text: 'underlined link · body',                        as: 'sans'  },
    tech:        { text: 'tech stack · mono chips',                       as: 'meta'  },
    bullets:     { text: 'bulleted list · serif body · markdown allowed', as: 'serif' },
  },
  languages: {
    language:    { text: 'language name · body',                          as: 'sans'  },
    proficiency: { text: 'tier label · mono · e.g. "C1 · Fluent"',        as: 'meta'  },
  },
  certifications: {
    name:   { text: 'Certification name · bold body',                     as: 'sans'  },
    issuer: { text: 'Issuing body · italic serif',                        as: 'serif' },
    date:   { text: '"YYYY-MM" → "Mar 2024"; "YYYY" → "2024"',             as: 'meta'  },
    link:   { text: 'underlined link · body',                             as: 'sans'  },
  },
};

// Small helper so the form code stays terse: `hint('contact', 'name')` returns
// `{ text, as }` or `null` for missing entries.
export const hint = (section, field) => HINTS[section]?.[field] ?? null;
