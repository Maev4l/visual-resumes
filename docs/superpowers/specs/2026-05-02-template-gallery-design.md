# Template gallery — design

## Summary

Authors should be able to glance at what each template looks like *before* committing to one. Today, picking a template means choosing by name and one-line description in the `/new` page, or via the unlabelled `<Select>` dropdown in the Edit page header — neither shows what the rendered resume actually looks like. Each template directory has a `preview.png` declared in `meta.json` but the files are 69-byte placeholder stubs, never populated.

This spec adds a dedicated `/templates` gallery page reachable from the Dashboard. Each template is rendered live (against a stock demo resume) into a thumbnail card; clicking a card opens a modal with a larger preview, navigation chevrons to flip between templates, and a primary "Use this template" CTA that jumps to `/new?templateId=<id>` with that template preselected.

## Scope

- **In scope:** new `/templates` route, three new components, a stock demo resume fixture, light edits to `Dashboard.jsx`, `New.jsx`, `App.jsx`.
- **Out of scope:** any change to `Edit.jsx`'s template-switch `<Select>`; filters / search on the gallery; per-template demo content; stock photos in the demo; baked / pre-rendered screenshots; a "preview my own resume in this template" affordance; any backend, Lambda, or schema change.

## Architecture

```
Dashboard ──"Browse templates"──▶ /templates
                                      │
                                      │ click card
                                      ▼
                              ┌───────────────┐
                              │ TemplateModal │
                              │ ←/→ chevrons  │
                              │ Use template ─┼──▶ /new?templateId=<id>
                              └───────────────┘
```

- New route `/templates` registered in `App.jsx` under `<RequireAuth>` (matches existing pattern; the app is closed to ~5 users — no public-marketing path needed).
- Pure SPA work. Reuses `TEMPLATES` from `@/templates` and `renderPreviewHtml` from `@/preview-renderer` (the same pipeline the in-editor preview iframe uses today).
- No new API endpoint, no Lambda redeploy, no schema/data change.
- Deploy: `yarn frontend:deploy` only.

## Components

### `pages/Templates.jsx` — gallery page

- Editorial chrome (kicker `Templates`, serif H1, double rule) consistent with `New.jsx` / `Dashboard.jsx`.
- 1/2/3-column responsive grid via `Object.entries(TEMPLATES).map(...)`. Same breakpoints as `New.jsx:76` (`sm:grid-cols-2 lg:grid-cols-3`).
- Owns modal state (`activeTemplateId: string | null`). `null` = no modal. Card click sets it; modal close clears it. Arrow-key handler in the modal updates it through a callback.
- Renders `<TemplateModal>` conditionally when `activeTemplateId !== null`.

### `editor/TemplateCard.jsx` — single grid card

- Wraps the existing `PaperCard` editorial primitive (already used by `New.jsx`).
- Composition top-to-bottom: `<TemplatePreviewFrame size="thumb">` → mono kicker (`Photo` or `No photo`) → serif title → 1-line `meta.description`.
- Whole card is the click target. No inline CTA — selection lives in the modal flow.

### `editor/TemplateModal.jsx` — enlarged view

- Built on the shadcn `Dialog` already used by `PublishModal`.
- Two-column layout inside `DialogContent`: left half is `<TemplatePreviewFrame size="large">` against a paper-deep background; right half is metadata block (mono "N of M" indicator, serif title, description, `Photo supported` / `A4 / Letter` chips, primary "Use this template" button).
- Keyboard handlers: `←` / `→` cycle templates without closing (the parent rotates `activeTemplateId`), `Esc` closes (Dialog default). Backdrop click also closes (Dialog default).
- "Use this template" calls `navigate('/new?templateId=<id>')`.

### `editor/TemplatePreviewFrame.jsx` — the only piece doing render work

- Props: `templateId: string`, `size: 'thumb' | 'large'`.
- Internally calls `renderPreviewHtml({ ...DEMO_RESUME, templateId })`, feeds the result into a `<iframe srcDoc={html} sandbox="allow-same-origin">` sized to fixed A4 (794×1123 CSS px @ 96 dpi).
- Wraps the iframe in a `<div>` that applies `transform: scale(...)` + `transform-origin: top left` + clipped `width` / `height`, so the rendered A4 page is scaled down to the requested thumbnail or large size:
  - `thumb` → factor ≈ 0.20 → ~159×225 px box.
  - `large` → factor ≈ 0.65 → ~516×730 px box (fits the modal left half on a laptop).
- The existing `createRenderer` cache in `preview-renderer.js` keys by template identity, so flipping between templates inside the modal recompiles Handlebars once per template at most.

## Data — stock demo resume

- Single fixture at `packages/editor/src/demo-resume.js` (next to the existing `templates.js`).
- Exports one resume object reused across **every** template — direct comparison is the whole point of the gallery; per-template demos would muddy that.
- Realistic-but-generic content: name "Jane Doe", 2-line summary, 3 work-experience entries, 2 education entries, 4 skill groups, 2 languages. Concrete enough to exercise each section type, not so distinctive that it overrides the template's character.
- `photoKey: null`, `_photoSrc: null`, `_photoVisible: true` (so each template renders its no-photo branch via the existing `_photoVisible` gate added earlier this session — the templates already handle this case correctly).
- Decision: **no stock photo in the demo.** Avoids licensing / face-picking concerns, keeps templates differentiated by layout rather than by which face dominates them. The "Photo supported" chip on the modal communicates which templates accept photos — informational only.

## Integration with existing surfaces

### `pages/Dashboard.jsx`

- Add a secondary "Browse templates" ghost button next to the existing "New résumé" CTA. Plain `<Link to="/templates">`. Match the page's existing header palette (no oxblood — would be too loud for a discovery affordance). One small JSX edit.

### `pages/New.jsx`

- Read `useSearchParams().get('templateId')` and use it as the `useState` initializer for `templateId`, *only if* it matches a key in `TEMPLATES`. Falls back to `'monaco'` as today.
- The existing 3-card picker stays unchanged — users who arrived via the gallery can still change their mind. The picker's existing "Selected" chip lights up on the pre-selected card.
- Roughly 3 new lines.

### `App.jsx`

- One new `<Route path="/templates" element={<RequireAuth><Templates/></RequireAuth>} />`.

## Testing

- **No automated component tests** — consistent with the editor's current posture (zero React component tests today; explicitly chosen earlier this session for the page-break feature). Verification = code review of small focused files + manual browser smoke.
- **Manual smoke checklist** to be in the implementation plan:
  1. Sign in, land on Dashboard, see new "Browse templates" button.
  2. Click → `/templates` loads, three cards render with mini-previews.
  3. Each card visually corresponds to its template (Avant teal sidebar, Modern coral+blue, Monaco green headers).
  4. Click any card → modal opens with the large preview of that template.
  5. Press `→` → modal flips to the next template; `←` flips back. `Esc` and backdrop click both close.
  6. "Use this template" navigates to `/new?templateId=<id>`.
  7. On `/new`, the picker shows the chosen template selected; "Begin composition" creates a resume with that template.

## Files touched

| Path | Action | Responsibility |
|---|---|---|
| `packages/editor/src/pages/Templates.jsx` | Create | Gallery page; owns modal state + grid layout. |
| `packages/editor/src/editor/TemplateCard.jsx` | Create | Single grid card (preview + name + 1-line description). |
| `packages/editor/src/editor/TemplateModal.jsx` | Create | Enlarged preview + chevrons + "Use this template" CTA. |
| `packages/editor/src/editor/TemplatePreviewFrame.jsx` | Create | A4-iframe + CSS-scale wrapper; only piece that renders. |
| `packages/editor/src/demo-resume.js` | Create | Stock demo resume fixture. |
| `packages/editor/src/App.jsx` | Modify | Register `/templates` route under `<RequireAuth>`. |
| `packages/editor/src/pages/Dashboard.jsx` | Modify | "Browse templates" ghost button next to "New résumé". |
| `packages/editor/src/pages/New.jsx` | Modify | Read `?templateId=` query param as initial selection. |

No backend / Lambda / schema / template / renderer / reducer changes.

## Deploy

`yarn frontend:deploy`. SPA-only.
