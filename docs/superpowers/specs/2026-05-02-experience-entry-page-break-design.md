# Per-entry page break in the Experience section

## Summary

Authors can already toggle `pageBreakBefore` at the **section** level via a checkbox in `SectionList.jsx`. The current bug/gap: there is no way to do the same at the **entry** level (e.g. force a page break before the third job in a long Experience section), even though the rendered templates already honour an `entry.pageBreakBefore` flag if present.

This spec adds an entry-level toggle in the Experience form, mirroring the section-level UX. Education, Projects, and Certifications are explicitly out of scope.

## Current state

- **Templates** — all three (`packages/templates/{avant,modern,monaco}/template.hbs`) already render entry-level page breaks inside the experience `{{#each data}}` loop:
  ```hbs
  {{#each data}}
    {{#if pageBreakBefore}}<div class="page-break"></div>{{/if}}
    <article class="entry">…</article>
  {{/each}}
  ```
  No template changes are needed.
- **Schema** — `packages/shared/schema/resume.schema.json` declares `pageBreakBefore` only on the `section` definition (line 42). The `experienceEntry` definition has no such property. JSON-Schema draft-07 defaults `additionalProperties: true`, so saving an entry with `pageBreakBefore` does not violate the schema today, but the field is undocumented.
- **Reducer** (`packages/editor/src/editor/reducer.js`) — only seeds `pageBreakBefore: false` on **section** creation. Per-entry edits flow through `updateSectionData` and the form's local `patch()` helper, not through a dedicated reducer action.
- **Form** (`packages/editor/src/editor/forms/ExperienceForm.jsx`) — has Move-up / Move-down / Remove buttons and the inline fields, but no page-break checkbox. New entries are seeded as `{ company, role, location, startDate, endDate, current, body }` with no `pageBreakBefore`.

## Scope

- **In scope:** the Experience section's per-entry page-break toggle.
- **Out of scope:** Education, Projects, Certifications entry-level toggles; any backfill / migration of pre-existing resumes; PDF-rendering changes; keyboard shortcuts or context-menu affordances.

## Approach

**Minimal change, no migration.** The existing template logic is already correct for present-or-absent `entry.pageBreakBefore`, so the only work is editor-side plus a schema documentation update.

## Design

### Schema

`packages/shared/schema/resume.schema.json` — add a `pageBreakBefore` property to the `experienceEntry` definition, mirroring the section-level declaration:

```json
"experienceEntry": {
  "type": "object",
  "required": ["company", "role", "startDate", "current"],
  "properties": {
    "company":         { "type": "string" },
    "role":            { "type": "string" },
    "location":        { "type": "string" },
    "startDate":       { "type": "string", "pattern": "^\\d{4}(-\\d{2}(-\\d{2})?)?$" },
    "endDate":         { "type": "string", "pattern": "^\\d{4}(-\\d{2}(-\\d{2})?)?$" },
    "current":         { "type": "boolean" },
    "body":            { "type": "string" },
    "pageBreakBefore": { "type": "boolean", "default": false }
  }
}
```

Other entry definitions (`educationEntry`, `projectEntry`, `languageEntry`, `certificationEntry`) are not modified.

### Form UI — `ExperienceForm.jsx`

Two changes:

1. **Seed the field on new entries.** In `add()`, include `pageBreakBefore: false` alongside the other defaults:
   ```js
   const add = () => onChange([...list, {
     company: '', role: '', location: '',
     startDate: '', endDate: '', current: false,
     body: '',
     pageBreakBefore: false,
   }]);
   ```

2. **Render the toggle** between the entry header row and the field grid, only for entries with `i > 0`:
   ```jsx
   {i > 0 && (
     <Label className="flex items-center gap-2 font-meta">
       <Checkbox
         checked={entry.pageBreakBefore ?? false}
         onCheckedChange={(v) => patch(i, { pageBreakBefore: Boolean(v) })}
       />
       Page break before
     </Label>
   )}
   ```

   Why hidden on entry 1: a page-break before the first entry is functionally equivalent to a section-level page-break (the section heading sits between any preceding content and the first entry). Exposing both would create two ways to spell the same intent and confuse the author.

   The toggle uses the same `<Label><Checkbox>` pair as `SectionList.jsx:58-67`, with the same label string ("Page break before"), so authors recognise it instantly.

### Reducer

No changes. Per-entry edits already flow through `updateSectionData` (`reducer.js`'s existing case), driven by the form's local `patch()` → `onChange(list)`. The new `pageBreakBefore` field rides through that same path.

### Renderer / templates

No changes. All three templates already short-circuit on `{{#if pageBreakBefore}}` inside the experience `{{#each data}}` loop, so the field becomes effective the moment any entry has `pageBreakBefore: true` saved.

### Backwards compatibility

Existing resumes saved before this change have entries without `pageBreakBefore`. The Handlebars `{{#if pageBreakBefore}}` evaluates `undefined` as falsy, so legacy entries continue to render unchanged. No migration step is required. The first time an author edits an existing resume and saves, only the entries they actually touched will pick up `pageBreakBefore: false`; that's expected (and explicit setting is harmless either way).

## Tests

No new automated tests. This is consistent with the rest of the editor codebase, which has no component-level tests today (only pure-function reducer/renderer tests). The change surface here is a 3-line conditional in JSX plus a single new field in the entry default — small enough that the JSX is its own assertion under code review, and Plan Task 3's manual browser smoke covers the actual rendered behavior.

The previously-unused `@testing-library/react` / `@testing-library/user-event` / `@testing-library/dom` dev dependencies are pruned from `packages/editor/package.json` as part of this change — they were declared but never imported by any test.

Existing tests for templates / renderer / reducer cover their own paths and remain untouched.

## Files touched

- `packages/shared/schema/resume.schema.json` — add `pageBreakBefore` to `experienceEntry`.
- `packages/editor/src/editor/forms/ExperienceForm.jsx` — seed new entries; render conditional toggle.
- `packages/editor/package.json` — prune unused `@testing-library/react`, `@testing-library/user-event`, `@testing-library/dom` (they were declared but never imported anywhere).
- `packages/templates/{avant,modern,monaco}/style.css` — fix the existing `.page-break` rule so the marker div actually triggers a page break in Chromium's paged-media engine. The previous `break-before: always` was silently ignored on empty divs in print/PDF; the corrected rule combines `display: block`, `break-before: page` (CSS3 explicit-page keyword), and the legacy `page-break-before: always` alias. This fix also restores the previously-broken section-level page break in published PDFs (it was emitted but never honored — the bug was latent until the entry-level feature exposed it).

## Deploy

Editor-only change — `yarn frontend:deploy` is sufficient. No Lambda, no infrastructure, no schema migration.
