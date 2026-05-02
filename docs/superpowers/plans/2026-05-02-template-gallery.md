# Template gallery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No commits.** Do NOT run `git add`, `git commit`, or `git push` at any point. Leave all changes staged/unstaged for the user to review and commit manually.

> **No automated component tests.** This codebase has no React component tests today; the spec explicitly chooses to keep that posture for this feature. Verification = code review + a manual browser smoke at the end.

**Goal:** New `/templates` route in the editor SPA that lets authors glance at each template (live mini-render against a stock demo resume), enlarge any of them in a modal, and jump to `/new` with the chosen template preselected.

**Architecture:** Pure SPA work. Reuses the existing `TEMPLATES` map, the `renderPreviewHtml` pipeline (same one that powers the in-editor preview iframe), the `PaperCard` editorial primitive, and the shadcn `Dialog`. Five new files (one fixture, one render frame, one card, one modal, one page) plus three small touch-ups (`App.jsx`, `Dashboard.jsx`, `New.jsx`). No backend, Lambda, schema, template, or reducer changes.

**Tech Stack:** React 18, react-router-dom 6, Vite 8 (`@`/`@templates` aliases). No new dependencies.

Spec: `docs/superpowers/specs/2026-05-02-template-gallery-design.md`.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `packages/editor/src/demo-resume.js` | Create | Stock demo fixture; one resume reused across every template. |
| `packages/editor/src/editor/TemplatePreviewFrame.jsx` | Create | A4 iframe + `transform: scale()` wrapper. Only piece doing render work. Two sizes: `thumb`, `large`. |
| `packages/editor/src/editor/TemplateCard.jsx` | Create | Single grid card (thumbnail preview + kicker + name + 1-line description). Whole card click target. |
| `packages/editor/src/editor/TemplateModal.jsx` | Create | Enlarged dialog. Two-column body. Arrow keys cycle templates. "Use this template" navigates to `/new?templateId=…`. |
| `packages/editor/src/pages/Templates.jsx` | Create | Gallery page; owns modal state + grid layout. |
| `packages/editor/src/App.jsx` | Modify | Register `<Route path="/templates" …>` under `<RequireAuth>`. |
| `packages/editor/src/pages/Dashboard.jsx` | Modify | Add "Browse templates" ghost button next to "New resume". |
| `packages/editor/src/pages/New.jsx` | Modify | Read `?templateId=` from `useSearchParams`; use as initial selection if it matches a `TEMPLATES` key. |

---

## Task 1: Stock demo resume fixture

**Files:**
- Create: `packages/editor/src/demo-resume.js`

The fixture is reused unchanged across every template — direct visual comparison is the whole point of the gallery, so per-template demos would muddy that. Generic-but-realistic content; concrete enough to exercise each section type, not so distinctive that it overrides the template's character. No photo (avoids licensing / face-picking; the "Photo supported" chip on the modal communicates capability separately).

- [ ] **Step 1: Write the file**

Create `packages/editor/src/demo-resume.js` with this content:

```js
// packages/editor/src/demo-resume.js
// Stock demo resume used by the /templates gallery to render each template at
// thumbnail and large sizes. Same fixture for every template so visual differences
// across the catalogue are purely template-driven (direct comparison is the point).
//
// Generic content: fictional name, plain-vanilla section data. No photo — keeps
// templates differentiated by layout, not by which face dominates them.

export const DEMO_RESUME = {
  id: 'DEMO',
  ownerCustomId: 'DEMO',
  title: 'Demo · Senior Engineer',
  templateId: 'monaco', // overridden by the consumer per-card.
  paperSize: 'A4',
  photoKey: null,
  published: null,
  sections: [
    {
      id: 'demo-contact',
      type: 'contact',
      pageBreakBefore: false,
      data: {
        name: 'Jane Doe',
        headline: 'Senior Software Engineer',
        email: 'jane.doe@example.com',
        phone: '+33 6 00 00 00 00',
        location: 'Paris, France',
        links: [
          { label: 'GitHub', url: 'https://github.com/janedoe' },
          { label: 'LinkedIn', url: 'https://linkedin.com/in/janedoe' },
        ],
      },
    },
    {
      id: 'demo-summary',
      type: 'summary',
      pageBreakBefore: false,
      data: {
        text: 'Backend engineer with eight years of experience building distributed systems. Comfortable across the stack — production Postgres, Kafka, Kubernetes — and unusually attached to writing readable code.',
      },
    },
    {
      id: 'demo-skills',
      type: 'skills',
      pageBreakBefore: false,
      data: [
        { group: 'Languages', items: ['Go', 'Python', 'TypeScript', 'Rust'] },
        { group: 'Infrastructure', items: ['Kubernetes', 'Terraform', 'AWS', 'PostgreSQL'] },
        { group: 'Practices', items: ['TDD', 'Trunk-based development', 'Code review'] },
        { group: 'Architecture', items: ['Event-driven systems', 'API design', 'Observability'] },
      ],
    },
    {
      id: 'demo-experience',
      type: 'experience',
      pageBreakBefore: false,
      data: [
        {
          company: 'Lumen Systems',
          role: 'Staff Engineer',
          location: 'Paris',
          startDate: '2022-03',
          endDate: '',
          current: true,
          body: 'Lead the platform team that runs the company\'s data ingestion pipeline.\n- Cut p99 latency from 1.4s to 220ms by sharding the hot path.\n- Owned migration from Mesos to Kubernetes; zero customer-visible downtime.',
        },
        {
          company: 'Northwind Labs',
          role: 'Senior Backend Engineer',
          location: 'Berlin',
          startDate: '2018-06',
          endDate: '2022-02',
          current: false,
          body: 'Built the billing service from scratch in Go.\n- Designed an idempotent webhook delivery layer used by 14 downstream teams.',
        },
        {
          company: 'Pivot & Co.',
          role: 'Software Engineer',
          location: 'Berlin',
          startDate: '2015-09',
          endDate: '2018-05',
          current: false,
          body: 'Generalist on a small product team. Shipped the first version of the analytics dashboard.',
        },
      ],
    },
    {
      id: 'demo-education',
      type: 'education',
      pageBreakBefore: false,
      data: [
        {
          institution: 'École Polytechnique',
          degree: 'M.Sc. Computer Science',
          field: 'Distributed Systems',
          startDate: '2013',
          endDate: '2015',
          notes: '',
        },
        {
          institution: 'Université Paris-Sud',
          degree: 'B.Sc. Computer Science',
          field: '',
          startDate: '2010',
          endDate: '2013',
          notes: '',
        },
      ],
    },
    {
      id: 'demo-languages',
      type: 'languages',
      pageBreakBefore: false,
      data: [
        { language: 'English', proficiency: 'Full professional proficiency' },
        { language: 'French', proficiency: 'Native or bilingual proficiency' },
      ],
    },
  ],
};
```

- [ ] **Step 2: Sanity check — make sure the module imports cleanly**

```bash
yarn --cwd packages/editor lint
```

Expected: no errors.

- [ ] **Step 3: Stop for review**

Pause here. The user reviews the fixture. Do not commit.

---

## Task 2: `TemplatePreviewFrame` — the only piece doing render work

**Files:**
- Create: `packages/editor/src/editor/TemplatePreviewFrame.jsx`

Renders the demo resume through the existing `renderPreviewHtml` pipeline into a sandboxed iframe sized to A4 (794×1123 CSS px @ 96 dpi), then CSS-scales it to the requested thumbnail or large size. The existing `createRenderer` cache in `preview-renderer.js` already memoizes per template, so flipping templates inside the modal recompiles Handlebars at most once per template.

- [ ] **Step 1: Write the file**

Create `packages/editor/src/editor/TemplatePreviewFrame.jsx`:

```jsx
// packages/editor/src/editor/TemplatePreviewFrame.jsx
// Live mini-render of a template against the stock demo resume. Renders A4 into
// an iframe and CSS-scales it down so callers can drop it into a thumbnail or
// large-preview slot without each one reinventing the scale math. Sandboxed
// + pointer-events:none so the iframe never steals clicks from its container.
import { useMemo } from 'react';
import { renderPreviewHtml } from '@/preview-renderer';
import { DEMO_RESUME } from '@/demo-resume';

// 96-dpi A4 in CSS pixels — the same canvas the in-editor preview uses.
const A4_CSS = { width: 794, height: 1123 };

// Picked so a `thumb` fits in a 3-column grid card at lg breakpoint
// (≈159×225 px) and a `large` fills the modal's left column comfortably
// on a laptop (≈516×730 px). Adjust here if container sizes change.
const SCALE = { thumb: 0.20, large: 0.65 };

const TemplatePreviewFrame = ({ templateId, size }) => {
  const html = useMemo(
    () => renderPreviewHtml({ ...DEMO_RESUME, templateId }),
    [templateId],
  );
  const factor = SCALE[size];
  const w = Math.round(A4_CSS.width * factor);
  const h = Math.round(A4_CSS.height * factor);
  return (
    <div
      style={{ width: w, height: h, overflow: 'hidden', position: 'relative' }}
      className="bg-white border border-[var(--color-rule)]"
    >
      <iframe
        title={`${templateId} preview`}
        srcDoc={html}
        sandbox="allow-same-origin"
        style={{
          width: A4_CSS.width,
          height: A4_CSS.height,
          transform: `scale(${factor})`,
          transformOrigin: 'top left',
          border: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

export default TemplatePreviewFrame;
```

- [ ] **Step 2: Lint**

```bash
yarn --cwd packages/editor lint
```

Expected: no errors.

- [ ] **Step 3: Stop for review**

Pause here. Do not commit.

---

## Task 3: `TemplateCard` — single grid card

**Files:**
- Create: `packages/editor/src/editor/TemplateCard.jsx`

Wraps the existing `PaperCard` editorial primitive (already used by `New.jsx:80`). Whole card is the click target — no inline CTA per the spec; selection lives in the modal.

- [ ] **Step 1: Write the file**

Create `packages/editor/src/editor/TemplateCard.jsx`:

```jsx
// packages/editor/src/editor/TemplateCard.jsx
// One thumbnail card on the /templates gallery. The whole card is the click
// target — no inline "Use this template" button, because the modal owns that
// CTA. Keeps cards calm and uniform in the grid.
import { TEMPLATES } from '@/templates';
import PaperCard from '@/components/editorial/PaperCard';
import MetaChip from '@/components/editorial/MetaChip';
import TemplatePreviewFrame from './TemplatePreviewFrame';

const TemplateCard = ({ templateId, onClick }) => {
  const t = TEMPLATES[templateId];
  return (
    <PaperCard
      as="button"
      type="button"
      interactive
      onClick={onClick}
      className="p-5 text-left grid gap-3"
    >
      {/* Paper-deep mat behind the preview keeps the white A4 visually distinct
          from the paper-coloured card surface. */}
      <div className="grid place-items-center bg-[var(--color-paper-deep)] p-3 rounded-sm">
        <TemplatePreviewFrame templateId={templateId} size="thumb" />
      </div>
      <MetaChip>{t.meta.supportsPhoto ? 'Photo' : 'No photo'}</MetaChip>
      <h3 className="font-serif text-2xl font-normal text-[var(--color-ink)]">
        {t.meta.name}
      </h3>
      <p className="text-sm leading-relaxed text-[var(--color-ink-faint)]">
        {t.meta.description}
      </p>
    </PaperCard>
  );
};

export default TemplateCard;
```

- [ ] **Step 2: Lint**

```bash
yarn --cwd packages/editor lint
```

Expected: no errors.

- [ ] **Step 3: Stop for review**

Pause here. Do not commit.

---

## Task 4: `TemplateModal` — enlarged dialog

**Files:**
- Create: `packages/editor/src/editor/TemplateModal.jsx`

Built on the shadcn `Dialog` (already used by `PublishModal`). Two-column layout. Arrow keys (`←` / `→`) rotate templates without closing — the parent owns `templateId`, modal pushes new ids back via `onTemplateChange`. Esc and backdrop click both close (Dialog default).

- [ ] **Step 1: Write the file**

Create `packages/editor/src/editor/TemplateModal.jsx`:

```jsx
// packages/editor/src/editor/TemplateModal.jsx
// Enlarged template preview. Two-column body: large live render on the left,
// metadata + CTA on the right. Arrow keys cycle templates without closing so
// the user can compare side-by-side without reopening the modal each time.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TEMPLATES } from '@/templates';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import TemplatePreviewFrame from './TemplatePreviewFrame';

const TemplateModal = ({ templateId, templateIds, onClose, onTemplateChange }) => {
  const navigate = useNavigate();

  // Wraparound cycling so → from the last template lands on the first.
  // Effect is bound to templateId/idx so the closure reads the freshest position.
  useEffect(() => {
    if (templateId == null) return undefined;
    const idx = templateIds.indexOf(templateId);
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        onTemplateChange(templateIds[(idx - 1 + templateIds.length) % templateIds.length]);
      } else if (e.key === 'ArrowRight') {
        onTemplateChange(templateIds[(idx + 1) % templateIds.length]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [templateId, templateIds, onTemplateChange]);

  if (templateId == null) return null;
  const t = TEMPLATES[templateId];
  const idx = templateIds.indexOf(templateId);

  const onUse = () => {
    navigate(`/new?templateId=${templateId}`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl">
        {/* sr-only header keeps Dialog accessible without competing with the
            visible title rendered in the right column. */}
        <DialogHeader className="sr-only">
          <DialogTitle>{t.meta.name} preview</DialogTitle>
          <DialogDescription>{t.meta.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1.4fr_1fr] gap-6">
          <div className="bg-[var(--color-paper-deep)] p-4 grid place-items-center rounded-sm">
            <TemplatePreviewFrame templateId={templateId} size="large" />
          </div>

          <div className="flex flex-col justify-between py-2 min-w-0">
            <div>
              <span className="font-meta inline-flex items-center gap-1.5 text-[var(--color-oxblood)]">
                <span className="inline-block size-1.5 rounded-full bg-[var(--color-oxblood)]" />
                {t.meta.name} · {idx + 1} of {templateIds.length}
              </span>
              <h3 className="font-serif text-3xl font-normal text-[var(--color-ink)] mt-2">
                {t.meta.name}
              </h3>
              <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mt-3">
                {t.meta.description}
              </p>
              <div className="flex flex-wrap gap-2 mt-5 font-meta">
                <span className="border border-[var(--color-rule)] rounded-sm px-2 py-1">
                  {t.meta.supportsPhoto ? 'Photo supported' : 'No photo'}
                </span>
                <span className="border border-[var(--color-rule)] rounded-sm px-2 py-1">
                  A4 / Letter
                </span>
              </div>
            </div>

            <Button
              type="button"
              onClick={onUse}
              className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)] mt-6 self-start"
            >
              Use this template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateModal;
```

- [ ] **Step 2: Lint**

```bash
yarn --cwd packages/editor lint
```

Expected: no errors.

- [ ] **Step 3: Stop for review**

Pause here. Do not commit.

---

## Task 5: `Templates.jsx` page + `App.jsx` route registration

**Files:**
- Create: `packages/editor/src/pages/Templates.jsx`
- Modify: `packages/editor/src/App.jsx` (add one route)

After this task the gallery is reachable by typing `/templates` in the URL bar (still unlinked; Dashboard wiring happens in Task 6).

- [ ] **Step 1: Write `Templates.jsx`**

Create `packages/editor/src/pages/Templates.jsx`:

```jsx
// packages/editor/src/pages/Templates.jsx
// /templates gallery. Editorial chrome (kicker + serif H1 + double rule),
// 1/2/3-column responsive grid of TemplateCards, click-to-enlarge modal.
// Modal state is owned here so arrow-key cycling inside the modal can mutate
// it directly via onTemplateChange.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { TEMPLATES } from '@/templates';
import { Button } from '@/components/ui/button';
import Page from '@/components/editorial/Page';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';
import TemplateCard from '@/editor/TemplateCard';
import TemplateModal from '@/editor/TemplateModal';

const Templates = () => {
  const ids = Object.keys(TEMPLATES);
  const [activeTemplateId, setActiveTemplateId] = useState(null);

  return (
    <Page width="standard">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="mb-6 -ml-2 text-[var(--color-ink-faint)]"
      >
        <Link to="/"><ArrowLeft className="size-4" /> Shelf</Link>
      </Button>

      <MetaChip className="mb-3">Templates</MetaChip>
      <h1 className="font-serif text-4xl font-light text-[var(--color-ink)]">
        Browse the catalogue
      </h1>
      <p className="font-serif italic text-[var(--color-ink-soft)] mt-3">
        Click any card to enlarge. Pick the one you'd like to use for your next résumé.
      </p>
      <RuleLine variant="double" className="mt-6 mb-10" />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ids.map((id) => (
          <TemplateCard
            key={id}
            templateId={id}
            onClick={() => setActiveTemplateId(id)}
          />
        ))}
      </div>

      <TemplateModal
        templateId={activeTemplateId}
        templateIds={ids}
        onClose={() => setActiveTemplateId(null)}
        onTemplateChange={setActiveTemplateId}
      />
    </Page>
  );
};

export default Templates;
```

- [ ] **Step 2: Register the route in `App.jsx`**

In `packages/editor/src/App.jsx`, add the `Templates` import and a new `<Route>`. Show the entire updated file:

```jsx
// Route map for the SPA. AuthProvider wraps everything so RequireAuth can read
// live session status. Cognito callback lands on `/` — Amplify reads the `?code`
// from the URL automatically on load, so no dedicated callback route is needed
// (this also avoids CloudFront SPA-fallback pain on a deep route that S3 can't serve).
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import RequireAuth from '@/auth/RequireAuth';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import New from '@/pages/New';
import Edit from '@/pages/Edit';
import Preview from '@/pages/Preview';
import Pending from '@/pages/Pending';
import NotFound from '@/pages/NotFound';
import Templates from '@/pages/Templates';

const App = () => (
  <AuthProvider>
    <Routes>
      <Route path="/login"        element={<Login />} />
      <Route path="/pending"      element={<Pending />} />
      <Route path="/"             element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/new"          element={<RequireAuth><New /></RequireAuth>} />
      <Route path="/edit/:id"     element={<RequireAuth><Edit /></RequireAuth>} />
      <Route path="/preview/:id"  element={<RequireAuth><Preview /></RequireAuth>} />
      <Route path="/templates"    element={<RequireAuth><Templates /></RequireAuth>} />
      <Route path="*"             element={<NotFound />} />
    </Routes>
  </AuthProvider>
);

export default App;
```

If your current `App.jsx` differs (e.g., extra routes), don't drop those — just splice in the `Templates` import and the new `<Route>` line in the same alphabetical/logical position.

- [ ] **Step 3: Lint**

```bash
yarn --cwd packages/editor lint
```

Expected: no errors.

- [ ] **Step 4: Manual sanity (dev server already running on :5178)**

Visit `http://localhost:5178/templates` directly in a browser tab. You should see the editorial header, three template cards in a responsive grid, each rendering its mini-preview. Click any card → modal opens with the large preview. `←` / `→` cycles templates. Esc closes. Clicking "Use this template" navigates to `/new?templateId=<id>` (the picker on /new still doesn't read that param yet — that's Task 7).

- [ ] **Step 5: Stop for review**

Pause here. Do not commit.

---

## Task 6: Dashboard — "Browse templates" entry point

**Files:**
- Modify: `packages/editor/src/pages/Dashboard.jsx`

The Dashboard's header currently has a primary "New resume" CTA + a ghost "Sign out". Add a secondary "Browse templates" ghost button between them — discovery affordance shouldn't compete visually with "New resume".

- [ ] **Step 1: Add the button**

In `packages/editor/src/pages/Dashboard.jsx`, find the header block:

```jsx
<header className="flex items-end gap-6 mb-8">
  <Wordmark size="md" />
  <div className="ml-auto flex items-center gap-3">
    <Button asChild className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]">
      <Link to="/new"><Plus className="size-4" /> New resume</Link>
    </Button>
    <Button variant="ghost" onClick={logout} className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
      Sign out
    </Button>
  </div>
</header>
```

Insert a `Browse templates` ghost button between "New resume" and "Sign out":

```jsx
<header className="flex items-end gap-6 mb-8">
  <Wordmark size="md" />
  <div className="ml-auto flex items-center gap-3">
    <Button asChild className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]">
      <Link to="/new"><Plus className="size-4" /> New resume</Link>
    </Button>
    <Button variant="ghost" asChild className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
      <Link to="/templates">Browse templates</Link>
    </Button>
    <Button variant="ghost" onClick={logout} className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
      Sign out
    </Button>
  </div>
</header>
```

No new imports — `Button` and `Link` are already imported in `Dashboard.jsx`.

- [ ] **Step 2: Lint**

```bash
yarn --cwd packages/editor lint
```

Expected: no errors.

- [ ] **Step 3: Manual sanity**

Visit `http://localhost:5178/` (Dashboard). The header should now show **New resume · Browse templates · Sign out** in that left-to-right order. Click "Browse templates" → navigates to `/templates`.

- [ ] **Step 4: Stop for review**

Pause here. Do not commit.

---

## Task 7: New.jsx — read `?templateId=` query param

**Files:**
- Modify: `packages/editor/src/pages/New.jsx`

Closes the loop from gallery → modal → "Use this template" → /new with the chosen template preselected. Existing 3-card picker stays — users who arrived via /templates can still change their mind, and the picker's "Selected" oxblood chip just lights up on the preselected card.

- [ ] **Step 1: Add `useSearchParams` import + initial-state derivation**

In `packages/editor/src/pages/New.jsx`:

(a) Add `useSearchParams` to the existing `react-router-dom` import:

```jsx
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
```

(b) Inside the `New` component body, before the `useState` calls, derive the initial template id from the query param. Replace the existing `const [templateId, setTemplateId] = useState('monaco');` line with:

```jsx
const [searchParams] = useSearchParams();
// Honour the gallery's "Use this template" hand-off. Falls back to monaco if
// the param is absent or names a template we no longer ship.
const requested = searchParams.get('templateId');
const initialTemplateId = requested && TEMPLATES[requested] ? requested : 'monaco';
const [templateId, setTemplateId] = useState(initialTemplateId);
```

Everything else in `New.jsx` stays the same — the existing picker reads `templateId` and renders the active state on the matching card.

- [ ] **Step 2: Lint**

```bash
yarn --cwd packages/editor lint
```

Expected: no errors.

- [ ] **Step 3: Manual sanity**

Visit `http://localhost:5178/new?templateId=avant` directly. The "Avant" card in the picker should be selected (oxblood "Selected" chip). Switch the query string to `?templateId=modern`, reload — Modern is selected. Visit `/new` with no query → Monaco is selected (today's default). Visit `/new?templateId=bogus` → Monaco (the falsy guard).

- [ ] **Step 4: Stop for review**

Pause here. Do not commit.

---

## Task 8: Final verification — full suite, lint, manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run the entire monorepo test suite**

```bash
yarn test
```

Expected: 141/141 across all workspaces (this plan adds no tests).

- [ ] **Step 2: Run all linters**

```bash
yarn lint
```

Expected: no errors.

- [ ] **Step 3: Manual end-to-end smoke**

In a browser tab connected to the editor dev server (`:5178`):

1. Sign in (if not already). Land on Dashboard.
2. Confirm the header shows the new **Browse templates** button between **New resume** and **Sign out**.
3. Click **Browse templates** → `/templates` loads. Three cards render in the grid; each shows a small live preview that visually corresponds to its template (Avant teal sidebar; Modern coral headline + light-blue sidebar; Monaco single-column with green headers).
4. Click any card → modal opens with the large preview of that template plus its metadata. The kicker reads "<name> · N of 3".
5. Press `→` → modal flips to the next template. `←` flips back. Wraparound works at both ends.
6. Press `Esc` → modal closes. Re-open by clicking a card. Click the dimmed backdrop → also closes.
7. Re-open the modal on, say, Avant. Click **Use this template** → URL becomes `/new?templateId=avant`, the picker on the New page shows Avant selected.
8. Click **Begin composition** → a new resume is created with the chosen template (verify via the editor header's template select).

If any step misbehaves, stop and surface the specific discrepancy. Otherwise the feature is complete.

- [ ] **Step 4: Stop for final review**

Tell the user the implementation is complete and ready for them to review the diff and commit. Do not commit yourself.

---

## Out of scope (do not implement)

- Filters / search on the gallery (premature with 3 templates; easy to layer on later).
- Per-template demo content; demos that exercise edge cases (overflow, missing photo, super-long bodies).
- Stock photos in the demo resume.
- Replacing or augmenting `Edit.jsx`'s template `<Select>` switcher.
- Auto-generated screenshots / build-time preview baking — explicit choice in the spec for live render.
- A "preview my own resume in this template" affordance in the modal — interesting, but a separate feature.
- Any automated component tests for the new components — explicit project choice; verification is code review + manual smoke.
