# Editor Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No commits.** Do NOT run `git add`, `git commit`, or `git push` at any point. Leave changes unstaged for manual review.

**Goal:** Replace the editor's default-shadcn chrome with an editorial / typographic-workshop aesthetic (Fraunces display + Inter Tight body, paper-cream canvas, oxblood accent, rule lines over boxes), redesign Login and Dashboard, add per-field "renders as…" ghost hints, and move the live preview out of a side panel into a dedicated browser window that syncs via `BroadcastChannel`.

**Architecture:** Two-track change. (1) A thin set of editorial primitives (`Page`, `RuleLine`, `MetaChip`, `FieldHint`, `Wordmark`) anchored to a new design-token layer in `src/index.css`. Existing shadcn/ui primitives stay where they are — they're used for form controls — but pages are rebuilt around the editorial primitives instead of shadcn `Card`. (2) A preview-in-window pattern: a new route `/preview/:id` renders the resume fullscreen; the Edit page broadcasts state changes through `BroadcastChannel('visual-resumes-preview')` and opens the preview window via `window.open`. Inline `Preview.jsx` and the preview toggle are retired.

**Tech Stack:** React 18 + Vite 8 + Tailwind 4 (CSS-first `@theme inline`), existing shared renderer (`@shared/renderer.js`), `BroadcastChannel` (native browser API). Google Fonts via `@import` in `index.css` for Fraunces + Inter Tight.

**Repo this plan runs in:** `visual-resumes`.

**Prerequisites:**
- Plan 6 applied. Editor SPA at `packages/editor/` is functional (login → dashboard → edit → publish all work end-to-end).
- `yarn frontend:serve` runs a local dev server at `http://localhost:5178/` with the proxy + materialized `public/config.json` in place.

---

## File structure (what this plan creates or modifies)

```
packages/editor/
├── index.html                              # MODIFY — preconnect to fonts.googleapis.com
├── src/
│   ├── index.css                           # REPLACE — design tokens + fonts + base typography
│   ├── App.jsx                             # MODIFY — add /preview/:id route
│   ├── components/
│   │   └── editorial/                      # NEW — aesthetic primitives
│   │       ├── Page.jsx
│   │       ├── RuleLine.jsx
│   │       ├── MetaChip.jsx
│   │       ├── FieldHint.jsx
│   │       ├── Wordmark.jsx
│   │       ├── PaperCard.jsx
│   │       └── SaveStatusChip.jsx          # NEW — autosave status indicator in header
│   ├── editor/
│   │   ├── hints.js                        # NEW — ghost-hint text per section type/field
│   │   ├── useBroadcastPreview.js          # NEW — hook: publish resume state on channel
│   │   ├── useAutosave.js                  # NEW — debounced autosave hook (1.5s)
│   │   ├── Preview.jsx                     # DELETE — inline preview retired
│   │   ├── SectionList.jsx                 # MODIFY — editorial chrome, wire FieldHint
│   │   ├── PhotoUpload.jsx                 # MODIFY — editorial styling
│   │   ├── PublishModal.jsx                # MODIFY — serif title + rule lines
│   │   └── forms/
│   │       ├── ContactForm.jsx             # MODIFY — FieldHint per field
│   │       ├── SummaryForm.jsx             # MODIFY
│   │       ├── ExperienceForm.jsx          # MODIFY
│   │       ├── EducationForm.jsx           # MODIFY
│   │       ├── SkillsForm.jsx              # MODIFY
│   │       ├── ProjectsForm.jsx            # MODIFY
│   │       ├── LanguagesForm.jsx           # MODIFY
│   │       └── CertificationsForm.jsx      # MODIFY
│   └── pages/
│       ├── Login.jsx                       # REPLACE — full-bleed typographic
│       ├── Dashboard.jsx                   # REPLACE — shelf of paper cards
│       ├── New.jsx                         # MODIFY — editorial chrome
│       ├── Edit.jsx                        # MODIFY — drop inline preview, add "Open preview" button
│       ├── Preview.jsx                     # NEW — standalone /preview/:id page
│       ├── Pending.jsx                     # MODIFY — editorial chrome
│       └── NotFound.jsx                    # MODIFY — editorial chrome
```

---

### Task 1: Design tokens + fonts + base typography

**Files:**
- Modify: `packages/editor/index.html`
- Replace: `packages/editor/src/index.css`

- [ ] **Step 1: Preconnect to Google Fonts in `index.html`**

Read the current `index.html` first. Then add these two `<link>` tags inside `<head>` just before the existing `<link rel="icon" …>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

Preconnect only — the actual `@import` lives in `index.css` so it participates in Vite's CSS dependency graph.

- [ ] **Step 2: Replace `src/index.css` entirely**

```css
@import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap");
@import "tailwindcss";
@import "tw-animate-css";

/*
 * Editorial / typographic-workshop palette.
 * Paper cream as the canvas (never pure white — feels industrial), near-black ink,
 * single saturated accent reserved for "live" / published states.
 * Depth comes from typography and rule lines, not shadows and cards.
 */
:root {
  --color-paper:        #F7F3EC;  /* background canvas */
  --color-paper-deep:   #EEE8DD;  /* recessed panels, hover states */
  --color-ink:          #1A1814;  /* primary text, headlines */
  --color-ink-soft:     #3D3833;  /* body text */
  --color-ink-faint:    #7A736B;  /* metadata, secondary */
  --color-rule:         #D9D2C5;  /* hair rules between sections */
  --color-rule-soft:    #E8E2D5;  /* lighter rules inside tight groups */
  --color-oxblood:      #7A1F1F;  /* single accent — published, active, destructive emphasis */
  --color-oxblood-soft: #A45454;  /* hover/active states on oxblood elements */

  /* Fallback shadcn tokens — still consumed by the bundled shadcn primitives.
     Mapped onto the editorial palette so buttons/inputs/selects don't look alien. */
  --background: var(--color-paper);
  --foreground: var(--color-ink);
  --card: var(--color-paper);
  --card-foreground: var(--color-ink);
  /* Popover surfaces (Select, DropdownMenu, Dialog floating panels) — paper with
     a hairline border. Without these tokens the floating panels render transparent. */
  --popover: var(--color-paper);
  --popover-foreground: var(--color-ink);
  --primary: var(--color-ink);                 /* primary buttons = ink on paper */
  --primary-foreground: var(--color-paper);
  --secondary: var(--color-paper-deep);
  --secondary-foreground: var(--color-ink);
  --muted: var(--color-paper-deep);
  --muted-foreground: var(--color-ink-faint);
  --accent: var(--color-paper-deep);
  --accent-foreground: var(--color-ink);
  --destructive: var(--color-oxblood);
  --destructive-foreground: var(--color-paper);
  --border: var(--color-rule);
  --input: var(--color-rule);
  --ring: var(--color-ink);
  --radius: 0.125rem;                          /* restrained — hair-thin rounding */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-paper: var(--color-paper);
  --color-paper-deep: var(--color-paper-deep);
  --color-ink: var(--color-ink);
  --color-ink-soft: var(--color-ink-soft);
  --color-ink-faint: var(--color-ink-faint);
  --color-rule: var(--color-rule);
  --color-rule-soft: var(--color-rule-soft);
  --color-oxblood: var(--color-oxblood);
  --color-oxblood-soft: var(--color-oxblood-soft);
  --radius-sm: var(--radius);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) * 2);
  --radius-xl: calc(var(--radius) * 3);
  --font-serif: "Fraunces", "Iowan Old Style", Georgia, serif;
  --font-sans:  "Inter Tight", ui-sans-serif, system-ui, sans-serif;
  --font-mono:  "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}

@layer base {
  *, ::before, ::after { border-color: var(--color-rule); }

  html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }

  body {
    background: var(--color-paper);
    color: var(--color-ink-soft);
    font-family: var(--font-sans);
    font-feature-settings: "ss01", "cv11";   /* Inter Tight: single-story a, stylistic tails */
    line-height: 1.5;
  }

  /* Display type: Fraunces with softer optical sizing + a touch more letter-spacing
     at larger sizes feels less generic than leaving opsz to the default. */
  h1, h2, h3, .font-display {
    font-family: var(--font-serif);
    color: var(--color-ink);
    font-weight: 450;
    letter-spacing: -0.015em;
    line-height: 1.1;
  }

  /* Metadata convention: small-caps mono for "PUBLISHED · 12m AGO"-style chips.
     Lightly tracked so at small sizes it still reads as a discrete unit. */
  .font-meta {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ink-faint);
  }
}
```

- [ ] **Step 3: Run the dev server and verify**

Run: `yarn frontend:serve`

Expected: dev server starts on 5178; existing pages load with new tokens applied. Specifically the `<body>` should now be cream (`#F7F3EC`), text should be Inter Tight, and any pre-existing `<h1>` / `<h2>` should be rendering Fraunces. Don't bother styling anything further yet — later tasks rebuild pages against these tokens.

---

### Task 2: Editorial primitives

**Files:**
- Create: `packages/editor/src/components/editorial/Page.jsx`
- Create: `packages/editor/src/components/editorial/RuleLine.jsx`
- Create: `packages/editor/src/components/editorial/MetaChip.jsx`
- Create: `packages/editor/src/components/editorial/FieldHint.jsx`
- Create: `packages/editor/src/components/editorial/Wordmark.jsx`
- Create: `packages/editor/src/components/editorial/PaperCard.jsx`

- [ ] **Step 1: `Page.jsx` — shared page shell**

```jsx
// packages/editor/src/components/editorial/Page.jsx
// Consistent canvas for every top-level route. WHY a component rather than Tailwind
// utility soup repeated on each page: the editorial aesthetic lives in small details
// (max-width, leading, vertical rhythm) that must stay in sync across pages.
const Page = ({ children, className = '', width = 'reading' }) => {
  const widths = {
    reading: 'max-w-[72ch]',   // ~text columns, for Login/Pending/NotFound
    standard: 'max-w-5xl',     // Dashboard, New
    wide:    'max-w-7xl',      // Edit
  };
  return (
    <main className={`min-h-screen bg-[var(--color-paper)] text-[var(--color-ink-soft)]`}>
      <div className={`${widths[width]} mx-auto px-6 py-10 ${className}`}>
        {children}
      </div>
    </main>
  );
};

export default Page;
```

- [ ] **Step 2: `RuleLine.jsx` — hair rule separator**

```jsx
// packages/editor/src/components/editorial/RuleLine.jsx
// Single hair rule used in place of shadcn card borders for section separation.
// `double` variant = the double-line printer's mark commonly used before/after a lead.
const RuleLine = ({ variant = 'single', className = '' }) => {
  if (variant === 'double') {
    return (
      <div className={`w-full ${className}`} aria-hidden="true">
        <div className="h-px bg-[var(--color-rule)]" />
        <div className="h-px bg-[var(--color-rule)] mt-[3px]" />
      </div>
    );
  }
  return <div className={`h-px bg-[var(--color-rule)] w-full ${className}`} aria-hidden="true" />;
};

export default RuleLine;
```

- [ ] **Step 3: `MetaChip.jsx` — small-caps mono metadata**

```jsx
// packages/editor/src/components/editorial/MetaChip.jsx
// Small-caps mono tag. `tone="live"` = oxblood dot + label; used for "PUBLISHED",
// active/selected states, or anything that should feel editorially important.
const MetaChip = ({ tone = 'muted', children, className = '' }) => {
  const colorClass =
    tone === 'live' ? 'text-[var(--color-oxblood)]'
    : tone === 'ink'  ? 'text-[var(--color-ink)]'
    : 'text-[var(--color-ink-faint)]';
  return (
    <span className={`font-meta inline-flex items-center gap-1.5 ${colorClass} ${className}`}>
      {tone === 'live' && <span className="inline-block size-1.5 rounded-full bg-[var(--color-oxblood)]" />}
      {children}
    </span>
  );
};

export default MetaChip;
```

- [ ] **Step 4: `Wordmark.jsx` — serif product mark**

```jsx
// packages/editor/src/components/editorial/Wordmark.jsx
// The product wordmark. Size prop maps to display scales; `withSubtitle` renders the
// tagline underneath for the Login hero.
const Wordmark = ({ size = 'md', withSubtitle = false, className = '' }) => {
  const sizes = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl sm:text-6xl',
    xl: 'text-6xl sm:text-8xl',
  };
  return (
    <div className={className}>
      <h1 className={`${sizes[size]} font-serif font-light leading-[0.95] tracking-[-0.02em] text-[var(--color-ink)]`}>
        Visual<span className="italic font-normal text-[var(--color-oxblood)]">&nbsp;Résumés</span>
      </h1>
      {withSubtitle && (
        <p className="mt-3 font-meta">A typographic workshop for your CV</p>
      )}
    </div>
  );
};

export default Wordmark;
```

- [ ] **Step 5: `FieldHint.jsx` — "renders as…" sample**

```jsx
// packages/editor/src/components/editorial/FieldHint.jsx
// Ghost hint shown BELOW each form field's label so the author can see how their
// input will be typeset in the published document. Rendered in Fraunces to mirror
// the template output style (templates all use serif display type for headlines).
const FieldHint = ({ children, as = 'serif' }) => {
  const typeClass =
    as === 'serif' ? 'font-serif italic text-[var(--color-ink-faint)]'
    : as === 'meta' ? 'font-meta'
    : 'font-sans text-[var(--color-ink-faint)] italic';
  return (
    <span className={`block text-xs leading-relaxed mt-0.5 ${typeClass}`}>
      <span className="not-italic font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)] mr-1.5">renders as</span>
      {children}
    </span>
  );
};

export default FieldHint;
```

- [ ] **Step 6: `PaperCard.jsx` — tactile document surface**

```jsx
// packages/editor/src/components/editorial/PaperCard.jsx
// A "sheet of paper" surface for Dashboard rows + the New page template picker.
// Depth comes from a very soft vertical-bias shadow and a 1-pixel outline rule,
// not from Material-style drop shadows. On hover the card lifts a hair and tilts
// by fractions of a degree — a Raycast-like detail that rewards pointer attention.
const PaperCard = ({ as: Tag = 'div', active = false, interactive = false, className = '', children, ...rest }) => {
  const base = 'relative bg-[var(--color-paper)] border transition-all duration-200';
  const borderColor = active
    ? 'border-[var(--color-ink)]'
    : 'border-[var(--color-rule)]';
  const shadow = 'shadow-[0_1px_0_var(--color-rule-soft),0_8px_18px_-14px_rgba(26,24,20,0.35)]';
  const hover = interactive
    ? 'hover:shadow-[0_2px_0_var(--color-rule-soft),0_16px_26px_-14px_rgba(26,24,20,0.45)] hover:-translate-y-[1px] hover:rotate-[-0.15deg] hover:border-[var(--color-ink-faint)]'
    : '';
  return (
    <Tag className={`${base} ${borderColor} ${shadow} ${hover} ${className}`} {...rest}>
      {children}
    </Tag>
  );
};

export default PaperCard;
```

- [ ] **Step 7: Lint**

Run: `cd packages/editor && yarn lint`
Expected: clean.

---

### Task 3: Login redesign

**Files:**
- Replace: `packages/editor/src/pages/Login.jsx`

- [ ] **Step 1: Replace `Login.jsx` with full-bleed typographic layout**

```jsx
// packages/editor/src/pages/Login.jsx
// Editorial front door. Left: huge wordmark + tagline as the hero. Right: a small,
// restrained Google button card. Background: cream with a faint diagonal rule pattern
// so the canvas has texture without competing with the type.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hub } from 'aws-amplify/utils';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import Wordmark from '@/components/editorial/Wordmark';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const Login = () => {
  const { status, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'authed') navigate('/', { replace: true });
  }, [status, navigate]);

  useEffect(() => Hub.listen('auth', ({ payload }) => {
    if (payload.event === 'signInWithRedirect_failure') {
      console.error('signInWithRedirect failed', payload.data);
    }
  }), []);

  return (
    <main
      className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink-soft)] relative overflow-hidden"
      // Diagonal hairline pattern — subtle paper texture without competing with type.
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, transparent 0 24px, rgba(26,24,20,0.015) 24px 25px)',
      }}
    >
      <div className="relative min-h-screen grid grid-rows-[auto_1fr_auto] lg:grid-rows-1 lg:grid-cols-[7fr_5fr]">
        {/* Left hero — canvas column */}
        <section className="flex flex-col justify-end p-8 sm:p-12 lg:p-16 lg:pr-20 lg:border-r border-[var(--color-rule)] min-h-[60vh] lg:min-h-screen">
          <MetaChip className="mb-6">Vol. II · Est. MMXXVI</MetaChip>
          <Wordmark size="xl" />
          <p className="mt-8 max-w-[32ch] text-lg sm:text-xl font-serif italic text-[var(--color-ink-soft)] leading-snug">
            A small, considered tool for authoring curricula vitæ worth reading.
          </p>
          <RuleLine variant="double" className="mt-10 max-w-[24ch]" />
          <p className="mt-6 max-w-[38ch] text-sm text-[var(--color-ink-faint)] leading-relaxed">
            Pick a template, compose your sections in a form, and publish to a static URL
            your readers will never see behind a login.
          </p>
        </section>

        {/* Right — sign-in panel */}
        <section className="flex flex-col justify-center p-8 sm:p-12 lg:p-16 bg-[var(--color-paper-deep)]/40">
          <MetaChip tone="ink" className="mb-4">Sign in</MetaChip>
          <h2 className="font-serif text-3xl font-light leading-tight text-[var(--color-ink)]">
            Continue with Google
          </h2>
          <p className="mt-3 text-sm text-[var(--color-ink-faint)] leading-relaxed max-w-[40ch]">
            Authoring requires a Google account. New accounts land in a pending state until
            the administrator approves access.
          </p>

          <Button
            variant="outline"
            className="mt-8 w-full h-12 gap-3 border-[var(--color-ink)] bg-[var(--color-paper)] hover:bg-[var(--color-paper-deep)] text-[var(--color-ink)] rounded-sm"
            onClick={() => login()}
            disabled={status === 'loading'}
          >
            <GoogleIcon />
            <span className="font-medium tracking-tight">Continue with Google</span>
          </Button>

          <p className="mt-8 font-meta">
            Closed beta · ~5 authors
          </p>
        </section>
      </div>
    </main>
  );
};

export default Login;
```

- [ ] **Step 2: Visit `http://localhost:5178/login` and sanity check**

Expected:
- Left pane fills ~60% (desktop), huge serif "Visual *Résumés*" (oxblood italic on the second word) anchored to the bottom-left with margin notes above.
- Right pane on `paper-deep` tint with the Google button.
- At mobile width the two panes stack vertically.
- No console errors.

- [ ] **Step 3: Lint**

Run: `cd packages/editor && yarn lint`
Expected: clean.

---

### Task 4: Dashboard redesign — shelf of paper cards

**Files:**
- Replace: `packages/editor/src/pages/Dashboard.jsx`

- [ ] **Step 1: Replace `Dashboard.jsx`**

```jsx
// packages/editor/src/pages/Dashboard.jsx
// Landing page after auth. Resumes are presented as a "shelf" of paper cards:
// serif title, metadata margin notes in small-caps mono, oxblood dot + mono label
// for published status. Actions live in a ghost dropdown so the card stays calm.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Plus, ExternalLink, MoreVertical } from 'lucide-react';

import { useAuth } from '@/auth/useAuth';
import { api, ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Page from '@/components/editorial/Page';
import Wordmark from '@/components/editorial/Wordmark';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';
import PaperCard from '@/components/editorial/PaperCard';

const Dashboard = () => {
  const { logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.listResumes()
      .then(({ data }) => setRows(data.resumes))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) navigate('/pending');
        else setError(err.message);
      });
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (id) => {
    if (!confirm('Delete this resume? Also unpublishes it if published.')) return;
    try { await api.deleteResume(id); toast.success('Deleted'); load(); }
    catch (err) { toast.error(`Delete failed: ${err.message}`); }
  };

  const onUnpublish = async (id) => {
    try { await api.revoke(id); toast.success('Unpublished'); load(); }
    catch (err) { toast.error(`Unpublish failed: ${err.message}`); }
  };

  return (
    <Page width="standard">
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

      <RuleLine variant="double" className="mb-8" />

      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-serif text-2xl font-normal text-[var(--color-ink)]">Your shelf</h2>
        <MetaChip>
          {rows ? `${rows.length} document${rows.length === 1 ? '' : 's'}` : '—'}
        </MetaChip>
      </div>

      {error && (
        <p role="alert" className="font-meta text-[var(--color-oxblood)]">Error · {error}</p>
      )}
      {rows === null && !error && (
        <p className="font-meta">Loading…</p>
      )}
      {rows?.length === 0 && (
        <PaperCard className="p-10 text-center">
          <p className="font-serif italic text-lg text-[var(--color-ink-faint)]">Your shelf is empty.</p>
          <p className="mt-2 text-sm text-[var(--color-ink-faint)]">
            Start with <Link to="/new" className="underline decoration-[var(--color-oxblood)] decoration-2 underline-offset-4 text-[var(--color-ink)]">New resume</Link>.
          </p>
        </PaperCard>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {rows?.map((r) => (
          <PaperCard key={r.id} interactive className="p-5 flex flex-col">
            <div className="flex items-start gap-2 mb-3">
              <MetaChip tone={r.published ? 'live' : 'muted'} className="flex-1">
                {r.published ? 'Published' : 'Draft'}
                <span className="mx-1 opacity-60">·</span>
                {r.templateId}
                <span className="mx-1 opacity-60">·</span>
                {r.paperSize}
              </MetaChip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Actions" className="-m-2 size-8">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {r.published && (
                    <DropdownMenuItem onClick={() => onUnpublish(r.id)}>Unpublish</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-[var(--color-oxblood)] focus:text-[var(--color-oxblood)]"
                    onClick={() => onDelete(r.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Link to={`/edit/${r.id}`} className="group block flex-1">
              <h3 className="font-serif text-xl font-normal leading-tight text-[var(--color-ink)] group-hover:text-[var(--color-oxblood)] transition-colors">
                {r.title || <span className="italic text-[var(--color-ink-faint)]">Untitled</span>}
              </h3>
              <p className="mt-3 font-meta">
                Updated {dayjs(r.updatedAt).format('D MMM YYYY')}
              </p>
            </Link>

            {r.published && (
              <div className="mt-4 pt-3 border-t border-[var(--color-rule-soft)] flex gap-3 font-meta">
                <a href={`/resumes/${r.published.slug}.html`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 hover:text-[var(--color-ink)]">
                  HTML <ExternalLink className="size-3" />
                </a>
                <a href={`/resumes/${r.published.slug}.pdf`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 hover:text-[var(--color-ink)]">
                  PDF <ExternalLink className="size-3" />
                </a>
              </div>
            )}
          </PaperCard>
        ))}
      </div>
    </Page>
  );
};

export default Dashboard;
```

- [ ] **Step 2: Visit `/` on localhost, sanity check**

Expected:
- Wordmark top-left, `New resume` (ink-on-paper primary button) + `Sign out` top-right.
- Double rule line under header.
- "Your shelf" serif heading with document count in margin-right mono.
- Grid of paper cards. Each card: meta chip row (tone=live with oxblood dot if published), serif title, mono "updated X".
- Hover a card: lifts 1px, tilts -0.15°, border darkens. Title flips to oxblood on hover.
- Published cards show rule-separated HTML / PDF mono links at the bottom.

- [ ] **Step 3: Lint**

Run: `cd packages/editor && yarn lint`
Expected: clean.

---

### Task 5: New page — aesthetic refresh

**Files:**
- Replace: `packages/editor/src/pages/New.jsx`

- [ ] **Step 1: Replace `New.jsx`**

```jsx
// packages/editor/src/pages/New.jsx
// Template picker. Each template is a PaperCard in a grid; the active one gets an
// ink border and the oxblood "Selected" chip. Inputs sit on the canvas without
// shadcn Card chrome.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

import { api } from '@/api/client';
import { TEMPLATES } from '@/templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Page from '@/components/editorial/Page';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';
import PaperCard from '@/components/editorial/PaperCard';

const New = () => {
  const navigate = useNavigate();
  const [templateId, setTemplateId] = useState('monaco');
  const [title, setTitle] = useState('');
  const [paperSize, setPaperSize] = useState('A4');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    setBusy(true);
    try {
      const { data } = await api.createResume({ title: title.trim(), templateId, paperSize });
      navigate(`/edit/${data.resume.id}`);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Page width="standard">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 text-[var(--color-ink-faint)]">
        <Link to="/"><ArrowLeft className="size-4" /> Shelf</Link>
      </Button>

      <MetaChip className="mb-3">New document</MetaChip>
      <h1 className="font-serif text-4xl font-light text-[var(--color-ink)]">
        Compose a new résumé
      </h1>
      <RuleLine variant="double" className="mt-6 mb-10" />

      <form onSubmit={onSubmit} className="grid gap-10">
        <section className="grid gap-3">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="title" className="font-serif text-lg font-normal text-[var(--color-ink)]">
              Title
            </Label>
            <MetaChip>Internal only</MetaChip>
          </div>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="EN · Senior Engineer"
            className="rounded-sm bg-[var(--color-paper)] border-[var(--color-rule)] focus-visible:border-[var(--color-ink)] font-serif text-xl h-12"
          />
          <span className="font-meta">Not shown publicly. Used to tell versions apart on your shelf.</span>
        </section>

        <section className="grid gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg font-normal text-[var(--color-ink)]">Template</h2>
            <MetaChip>{Object.keys(TEMPLATES).length} available</MetaChip>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(TEMPLATES).map(([id, t]) => {
              const active = templateId === id;
              return (
                <PaperCard
                  as="button"
                  key={id}
                  type="button"
                  interactive
                  active={active}
                  onClick={() => setTemplateId(id)}
                  className="p-5 text-left"
                >
                  <MetaChip tone={active ? 'live' : 'muted'}>
                    {active ? 'Selected' : t.meta.supportsPhoto ? 'Photo' : 'No photo'}
                  </MetaChip>
                  <h3 className="mt-3 font-serif text-2xl font-normal text-[var(--color-ink)]">
                    {t.meta.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-faint)]">
                    {t.meta.description}
                  </p>
                </PaperCard>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3">
          <Label className="font-serif text-lg font-normal text-[var(--color-ink)]">Paper size</Label>
          <Select value={paperSize} onValueChange={setPaperSize}>
            <SelectTrigger className="w-40 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="Letter">Letter</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <RuleLine />

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" asChild className="text-[var(--color-ink-faint)]">
            <Link to="/">Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]"
          >
            {busy ? 'Composing…' : 'Begin composition'}
          </Button>
        </div>
      </form>
    </Page>
  );
};

export default New;
```

- [ ] **Step 2: Visit `/new` and verify**

Expected:
- `← Shelf` back link.
- "New document" meta chip + serif "Compose a new résumé" h1 + double rule.
- Title input uses Fraunces and shows a mono footer note.
- Template cards in 2/3 columns. Selected card has ink border + "Selected" meta chip in oxblood.
- "Paper size" select + ink-on-paper "Begin composition" submit.

- [ ] **Step 3: Lint**

Run: `cd packages/editor && yarn lint`
Expected: clean.

---

### Task 6: Ghost hints data

**Files:**
- Create: `packages/editor/src/editor/hints.js`

- [ ] **Step 1: Create `hints.js`**

```javascript
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
```

- [ ] **Step 2: Lint**

Run: `cd packages/editor && yarn lint`
Expected: clean.

---

### Task 7: Wire FieldHint into every form

**Files:**
- Modify: `packages/editor/src/editor/forms/ContactForm.jsx`
- Modify: `packages/editor/src/editor/forms/SummaryForm.jsx`
- Modify: `packages/editor/src/editor/forms/ExperienceForm.jsx`
- Modify: `packages/editor/src/editor/forms/EducationForm.jsx`
- Modify: `packages/editor/src/editor/forms/SkillsForm.jsx`
- Modify: `packages/editor/src/editor/forms/ProjectsForm.jsx`
- Modify: `packages/editor/src/editor/forms/LanguagesForm.jsx`
- Modify: `packages/editor/src/editor/forms/CertificationsForm.jsx`

> **Pattern:** wrap every `<Label>` with a sibling `<FieldHint>` pulled from `hints.js`.
> All eight forms use the same convention. The code below is the full replacement for
> the three representative shapes (object-keyed, list-keyed, simple-scalar) — apply the
> same pattern to the rest, tweaking only the `hint(section, field)` lookups.

- [ ] **Step 1: Replace `ContactForm.jsx`**

```jsx
// packages/editor/src/editor/forms/ContactForm.jsx
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import FieldHint from '@/components/editorial/FieldHint';
import { hint } from '../hints';

// Tiny helper: label + hint in a stable vertical rhythm so the form scans as a table
// of typographic roles rather than a flat field list.
const H = ({ children, hintKey }) => {
  const h = hint('contact', hintKey);
  return (
    <div className="grid gap-0.5">
      <Label>{children}</Label>
      {h && <FieldHint as={h.as}>{h.text}</FieldHint>}
    </div>
  );
};

const ContactForm = ({ data, onChange, photoSlot }) => {
  const patch = (p) => onChange({ ...data, ...p });
  const patchLink = (i, p) => patch({
    links: data.links.map((lnk, idx) => (idx === i ? { ...lnk, ...p } : lnk)),
  });
  const addLink = () => patch({ links: [...data.links, { label: '', url: '' }] });
  const removeLink = (i) => patch({ links: data.links.filter((_, idx) => idx !== i) });

  return (
    <div className="grid gap-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="grid gap-1.5">
          <H hintKey="name">Name</H>
          <Input value={data.name ?? ''} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <H hintKey="headline">Headline</H>
          <Input
            value={data.headline ?? ''}
            onChange={(e) => patch({ headline: e.target.value })}
            placeholder="Senior Engineer"
          />
        </div>
        <div className="grid gap-1.5">
          <H hintKey="email">Email</H>
          <Input type="email" value={data.email ?? ''} onChange={(e) => patch({ email: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <H hintKey="phone">Phone</H>
          <Input value={data.phone ?? ''} onChange={(e) => patch({ phone: e.target.value })} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <H hintKey="location">Location</H>
          <Input value={data.location ?? ''} onChange={(e) => patch({ location: e.target.value })} />
        </div>
      </div>

      {photoSlot}

      <div className="grid gap-2">
        <Label>Links</Label>
        {(data.links ?? []).map((lnk, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <div className="grid gap-1">
              <Input
                placeholder="label"
                value={lnk.label}
                onChange={(e) => patchLink(i, { label: e.target.value })}
              />
              {i === 0 && <FieldHint as={hint('contact', 'linkLabel').as}>{hint('contact', 'linkLabel').text}</FieldHint>}
            </div>
            <div className="grid gap-1">
              <Input
                placeholder="https://…"
                value={lnk.url}
                onChange={(e) => patchLink(i, { url: e.target.value })}
              />
              {i === 0 && <FieldHint as={hint('contact', 'linkUrl').as}>{hint('contact', 'linkUrl').text}</FieldHint>}
            </div>
            <Button type="button" variant="ghost" size="icon"
              onClick={() => removeLink(i)} aria-label="Remove">
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addLink} className="justify-self-start rounded-sm">
          Add link
        </Button>
      </div>
    </div>
  );
};

export default ContactForm;
```

- [ ] **Step 2: Replace `SummaryForm.jsx` (simple-scalar shape)**

```jsx
// packages/editor/src/editor/forms/SummaryForm.jsx
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FieldHint from '@/components/editorial/FieldHint';
import { hint } from '../hints';

const SummaryForm = ({ data, onChange }) => {
  const h = hint('summary', 'text');
  return (
    <div className="grid gap-1.5">
      <Label>Text</Label>
      {h && <FieldHint as={h.as}>{h.text}</FieldHint>}
      <Textarea
        rows={4}
        value={data.text ?? ''}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="A short lead paragraph…"
      />
    </div>
  );
};

export default SummaryForm;
```

- [ ] **Step 3: Replace `ExperienceForm.jsx` (list-shape representative)**

```jsx
// packages/editor/src/editor/forms/ExperienceForm.jsx
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import FieldHint from '@/components/editorial/FieldHint';
import RuleLine from '@/components/editorial/RuleLine';
import { hint } from '../hints';

const H = ({ children, hintKey, first }) => {
  const h = first ? hint('experience', hintKey) : null;
  return (
    <div className="grid gap-0.5">
      <Label>{children}</Label>
      {h && <FieldHint as={h.as}>{h.text}</FieldHint>}
    </div>
  );
};

const ExperienceForm = ({ data, onChange }) => {
  const list = Array.isArray(data) ? data : [];
  const patch = (i, p) => onChange(list.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  const add = () => onChange([...list, {
    company: '', role: '', location: '', startDate: '', endDate: '', current: false, body: '',
  }]);
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };

  return (
    <div className="grid gap-6">
      {list.map((entry, i) => (
        <div key={i} className="grid gap-4">
          {i > 0 && <RuleLine className="my-2" />}
          <div className="flex items-center justify-between">
            <span className="font-meta">Entry {i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Move up"
                onClick={() => move(i, 'up')} disabled={i === 0}><ArrowUp className="size-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move down"
                onClick={() => move(i, 'down')} disabled={i === list.length - 1}><ArrowDown className="size-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove"
                onClick={() => remove(i)} className="text-[var(--color-oxblood)]"><X className="size-4" /></Button>
            </div>
          </div>

          {/* Each cell uses flex-col + mt-auto on the Input so inputs bottom-align
              across a row regardless of how many lines the FieldHint wraps to.
              Mixing short/long hints would otherwise leave inputs at different heights. */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <H hintKey="company" first={i === 0}>Company</H>
              <Input className="mt-auto" value={entry.company ?? ''} onChange={(e) => patch(i, { company: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <H hintKey="role" first={i === 0}>Role</H>
              <Input className="mt-auto" value={entry.role ?? ''} onChange={(e) => patch(i, { role: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <H hintKey="location" first={i === 0}>Location</H>
              <Input className="mt-auto" value={entry.location ?? ''} onChange={(e) => patch(i, { location: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <H hintKey="startDate" first={i === 0}>Start</H>
                <Input className="mt-auto" placeholder="YYYY-MM or YYYY" value={entry.startDate ?? ''} onChange={(e) => patch(i, { startDate: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <H hintKey="endDate" first={i === 0}>End</H>
                <Input className="mt-auto" placeholder="YYYY-MM or YYYY" value={entry.endDate ?? ''} disabled={entry.current}
                  onChange={(e) => patch(i, { endDate: e.target.value })} />
              </div>
            </div>
            <Label className="flex items-center gap-2 text-sm font-normal sm:col-span-2">
              <Checkbox checked={!!entry.current} onCheckedChange={(v) => patch(i, { current: Boolean(v), endDate: v ? '' : entry.endDate })} />
              Currently here
            </Label>
          </div>

          <div className="grid gap-1.5">
            <H hintKey="body" first={i === 0}>Body</H>
            <Textarea
              rows={8}
              value={entry.body ?? ''}
              onChange={(e) => patch(i, { body: e.target.value })}
              className="font-mono text-sm leading-relaxed"
              placeholder={`Freeform markdown. A lead sentence becomes a paragraph; lines starting with "- " become bullets; indent nested bullets with two spaces.

Design the architecture of the IAM and KMS services.
- Create and maintain technical documentation
- Monitor and optimize system performance

Or pure nested bullets:
- Lead security expert for the Analytics org
  - Conduct risk assessments and drive GDPR compliance
  - Trainer for Security Awareness and Secure Programming`}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="justify-self-start rounded-sm">
        <Plus className="size-4" /> Add entry
      </Button>
    </div>
  );
};

export default ExperienceForm;
```

- [ ] **Step 4: Apply the same pattern to remaining forms**

For each of these five files, import `FieldHint` + `hint`, wrap every `<Label>` with the `H` helper (inline — same 10-line local helper as in ContactForm), and call `hint('<section-id>', '<field-name>')`. Section IDs match the keys in `HINTS`.

Apply identically to:
- `EducationForm.jsx` — list shape like ExperienceForm. Start/End as two separate text inputs with `placeholder="YYYY-MM or YYYY"` (End is optional — omit for in-progress study). Do NOT use `<Input type="date">` here — it forces the HTML date picker which rejects year-only input.
- `SkillsForm.jsx` — list shape
- `ProjectsForm.jsx` — list shape
- `LanguagesForm.jsx` — list shape
- `CertificationsForm.jsx` — list shape. `date` is a single text input with `placeholder="YYYY-MM or YYYY"`.

Only the `hint('<section>', …)` calls and the fields themselves change. The outer wrapper, add/move/remove controls, and the `H` helper are identical. Preserve the existing reducer wiring (`data`, `onChange` props) — don't change signatures.

- [ ] **Step 5: Visit an existing resume with every section type and sanity check**

Expected: every form field label now has a small "RENDERS AS · <sample>" italic serif/mono line directly beneath it. The Edit page should still save and preview without error.

- [ ] **Step 6: Lint**

Run: `cd packages/editor && yarn lint`
Expected: clean.

---

### Task 8: Broadcast-preview hook + standalone Preview page

**Files:**
- Create: `packages/editor/src/editor/useBroadcastPreview.js`
- Create: `packages/editor/src/pages/Preview.jsx`
- Modify: `packages/editor/src/App.jsx`

- [ ] **Step 1: `useBroadcastPreview.js` — publisher hook**

```javascript
// packages/editor/src/editor/useBroadcastPreview.js
// Publishes the current resume state + photoDataUri over a named BroadcastChannel
// whenever either changes, so the standalone /preview/:id window can re-render live
// without polling or refetching. Subscribers use the same channel name.
//
// Why BroadcastChannel: works same-origin across tabs/windows, zero setup, tiny API.
// We debounce to 60ms so a rapid typist doesn't flood the channel mid-keystroke.
import { useEffect, useRef } from 'react';

export const PREVIEW_CHANNEL = 'visual-resumes-preview';

export const useBroadcastPreview = ({ resumeId, resume, photoDataUri }) => {
  const channelRef = useRef(null);

  useEffect(() => {
    const ch = new BroadcastChannel(PREVIEW_CHANNEL);
    channelRef.current = ch;

    // If a preview window is already open when the edit page mounts, it may have
    // joined the channel before us — emit the initial state so it rehydrates.
    return () => { ch.close(); channelRef.current = null; };
  }, []);

  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const handle = setTimeout(() => {
      ch.postMessage({ type: 'state', resumeId, resume, photoDataUri });
    }, 60);
    return () => clearTimeout(handle);
  }, [resumeId, resume, photoDataUri]);

  // Expose a manual trigger for cases like "preview window just opened and asked
  // for state" — the preview page posts a `request` message and the editor replies.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const onMessage = ({ data }) => {
      if (data?.type === 'request' && data.resumeId === resumeId) {
        ch.postMessage({ type: 'state', resumeId, resume, photoDataUri });
      }
    };
    ch.addEventListener('message', onMessage);
    return () => ch.removeEventListener('message', onMessage);
  }, [resumeId, resume, photoDataUri]);
};
```

- [ ] **Step 2: `Preview.jsx` — standalone page**

```jsx
// packages/editor/src/pages/Preview.jsx
// Dedicated preview window at /preview/:id. Renders the resume full-bleed using the
// shared preview renderer. Receives state live from the Edit page via BroadcastChannel;
// on first mount it posts a `request` so the editor replays current state.
//
// If the user navigates here directly (no editor open), we fall back to fetching from
// the API so the URL still works as a shareable authoring preview.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/api/client';
import { renderPreviewHtml } from '@/preview-renderer';
import { PREVIEW_CHANNEL } from '@/editor/useBroadcastPreview';

const Preview = () => {
  const { id } = useParams();
  const [resume, setResume] = useState(null);
  const [photoDataUri, setPhotoDataUri] = useState(null);
  const [error, setError] = useState(null);

  // Subscribe to the channel + announce presence so an already-mounted Edit page
  // replays its current state into us.
  useEffect(() => {
    const ch = new BroadcastChannel(PREVIEW_CHANNEL);
    const onMessage = ({ data }) => {
      if (data?.type === 'state' && data.resumeId === id) {
        setResume(data.resume);
        setPhotoDataUri(data.photoDataUri ?? null);
      }
    };
    ch.addEventListener('message', onMessage);
    ch.postMessage({ type: 'request', resumeId: id });

    // Fallback: if no state arrives within 800ms, the edit page isn't open — fetch.
    const timer = setTimeout(() => {
      setResume((prev) => prev ?? 'NO_CHANNEL');
    }, 800);

    return () => { clearTimeout(timer); ch.removeEventListener('message', onMessage); ch.close(); };
  }, [id]);

  // Handle the no-channel fallback — once we've waited 800ms with no edit page,
  // load from the API directly.
  useEffect(() => {
    if (resume !== 'NO_CHANNEL') return;
    api.getResume(id)
      .then(({ data }) => { setResume(data.resume); setPhotoDataUri(data.photoDataUri ?? null); })
      .catch((err) => setError(err.message));
  }, [resume, id]);

  useEffect(() => { document.title = `Preview · ${resume?.title ?? '…'}`; }, [resume]);

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--color-paper)]">
        <p role="alert" className="font-meta text-[var(--color-oxblood)]">Error · {error}</p>
      </main>
    );
  }
  if (!resume || resume === 'NO_CHANNEL') {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--color-paper)]">
        <p className="font-meta">Waiting for editor…</p>
      </main>
    );
  }

  let html;
  try {
    html = renderPreviewHtml({ ...resume, _photoSrc: photoDataUri ?? null });
  } catch (err) {
    html = `<!doctype html><body style="font-family:ui-monospace,monospace;padding:1rem;color:#7A1F1F"><pre>${err.message}</pre></body>`;
  }

  return (
    <iframe
      title="preview"
      srcDoc={html}
      sandbox="allow-same-origin"
      className="w-screen h-screen border-0 bg-white"
    />
  );
};

export default Preview;
```

- [ ] **Step 3: Register the route in `App.jsx`**

Read `src/App.jsx`. Add a new import + a new `<Route>` entry. The preview route sits INSIDE `<RequireAuth>` — the user must be signed in, and since they're signed in on the editor tab, the new window inherits the Cognito session via shared cookie/storage on the same origin.

```jsx
// packages/editor/src/App.jsx
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

const App = () => (
  <AuthProvider>
    <Routes>
      <Route path="/login"       element={<Login />} />
      <Route path="/pending"     element={<Pending />} />
      <Route path="/"            element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/new"         element={<RequireAuth><New /></RequireAuth>} />
      <Route path="/edit/:id"    element={<RequireAuth><Edit /></RequireAuth>} />
      <Route path="/preview/:id" element={<RequireAuth><Preview /></RequireAuth>} />
      <Route path="*"            element={<NotFound />} />
    </Routes>
  </AuthProvider>
);

export default App;
```

- [ ] **Step 4: Lint**

Run: `cd packages/editor && yarn lint`
Expected: clean.

---

### Task 8b: Autosave hook + status chip

**Files:**
- Create: `packages/editor/src/editor/useAutosave.js`
- Create: `packages/editor/src/components/editorial/SaveStatusChip.jsx`

> **Why now:** the old Edit page had a manual Save button. We're dropping it in favour of
> a 1.5s-debounced autosave, with a mono status chip in the header rail that surfaces
> state as: `Unsaved` → `Saving…` → `Saved · Ns ago`. Task 9 wires both into Edit.jsx.

- [ ] **Step 1: `useAutosave.js`**

```javascript
// packages/editor/src/editor/useAutosave.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/api/client';

// 1.5s debounce: fast enough to feel "live" as the author types, slow enough to
// coalesce bursts of keystrokes into a single round-trip.
const DEBOUNCE_MS = 1500;

/**
 * Autosave hook. Watches `dirty` and, while dirty, schedules a debounced PUT
 * against the resume endpoint. Reruns the debounce timer on every state change,
 * so rapid typing never races — only the last state hits the server.
 *
 * On ETag conflict (412) it calls `onStale` so the Edit page can refetch + rehydrate.
 * `flushNow()` bypasses the debounce — e.g. for a ⌘S keyboard shortcut.
 */
export const useAutosave = ({ resumeId, resume, etag, dirty, onSaved, onStale }) => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  const [savedAt, setSavedAt] = useState(null);

  const timerRef = useRef(null);
  const latestRef = useRef({ resume, etag });
  useEffect(() => { latestRef.current = { resume, etag }; }, [resume, etag]);

  const performSave = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setStatus('saving');
    try {
      const { etag: newEtag } = await api.putResume(resumeId, latestRef.current.resume, latestRef.current.etag);
      onSaved(newEtag);
      setStatus('saved');
      setSavedAt(Date.now());
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        toast.warning('Your copy was stale — reloaded');
        await onStale();
        setStatus('idle');
      } else {
        console.error('autosave failed', err);
        setStatus('error');
      }
    }
  }, [resumeId, onSaved, onStale]);

  useEffect(() => {
    if (!dirty) return undefined;
    setStatus('pending');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(performSave, DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [dirty, resume, performSave]);

  return { status, savedAt, flushNow: performSave };
};
```

- [ ] **Step 2: `SaveStatusChip.jsx`**

```jsx
// packages/editor/src/components/editorial/SaveStatusChip.jsx
import { useEffect, useState } from 'react';
import MetaChip from './MetaChip';

const relativeTime = (ms) => {
  if (!ms) return '';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10)   return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return 'a while ago';
};

const SaveStatusChip = ({ status, savedAt, onRetry }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'saved') return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, [status, savedAt]);

  if (status === 'pending') return <MetaChip>Unsaved</MetaChip>;
  if (status === 'saving')  return <MetaChip tone="ink">Saving…</MetaChip>;
  if (status === 'saved')   return <MetaChip>Saved · {relativeTime(savedAt)}</MetaChip>;
  if (status === 'error') {
    return (
      <button type="button" onClick={onRetry} className="focus-visible:outline-none">
        <MetaChip tone="live">Error · retry</MetaChip>
      </button>
    );
  }
  return null;
};

export default SaveStatusChip;
```

- [ ] **Step 3: Lint**

Run: `cd packages/editor && yarn lint`
Expected: clean.

---

### Task 9: Edit page — drop inline preview + Save button, wire autosave, editorial chrome

**Files:**
- Modify: `packages/editor/src/pages/Edit.jsx`
- Modify: `packages/editor/src/editor/SectionList.jsx`
- Modify: `packages/editor/src/editor/PhotoUpload.jsx`
- Delete: `packages/editor/src/editor/Preview.jsx`

- [ ] **Step 1: Replace `Edit.jsx`**

```jsx
// packages/editor/src/pages/Edit.jsx
// Main editor page. The header is a sticky editorial bar (wordmark left, title input
// centre, controls right). Inline preview is gone: "Open preview" opens a dedicated
// window at /preview/:id which stays synchronised via BroadcastChannel. No Save button:
// edits autosave on a 1.5s debounce; a mono status chip in the header rail shows
// "Unsaved" → "Saving…" → "Saved · Ns ago" live. ⌘S (or Ctrl+S) flushes immediately.
import { useCallback, useEffect, useReducer, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Upload } from 'lucide-react';

import { toast } from 'sonner';

import { api } from '@/api/client';
import { getConfig } from '@/config';
import { reducer, initialState, actions } from '@/editor/reducer';
import { useBroadcastPreview } from '@/editor/useBroadcastPreview';
import { useAutosave } from '@/editor/useAutosave';
import SectionList from '@/editor/SectionList';
import PhotoUpload from '@/editor/PhotoUpload';
import PublishModal from '@/editor/PublishModal';
import { TEMPLATES } from '@/templates';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Wordmark from '@/components/editorial/Wordmark';
import MetaChip from '@/components/editorial/MetaChip';
import RuleLine from '@/components/editorial/RuleLine';
import SaveStatusChip from '@/components/editorial/SaveStatusChip';

const Edit = () => {
  const { id } = useParams();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [photoDataUri, setPhotoDataUri] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [republishing, setRepublishing] = useState(false);

  // Publish resume state over BroadcastChannel to any /preview/:id window.
  useBroadcastPreview({ resumeId: id, resume: state.resume, photoDataUri });

  const refetch = useCallback(() => api.getResume(id).then(({ data }) => {
    dispatch(actions.hydrate({ resume: data.resume, etag: data.etag }));
    setPhotoDataUri(data.photoDataUri ?? null);
    setLoaded(true);
  }), [id]);

  useEffect(() => { refetch().catch((err) => setError(err.message)); }, [refetch]);

  const onSaved = useCallback((etag) => dispatch(actions.saved(etag)), []);

  const { status: saveStatus, savedAt, flushNow } = useAutosave({
    resumeId: id,
    resume: state.resume,
    etag: state.etag,
    dirty: state.dirty,
    onSaved,
    onStale: refetch,
  });

  // ⌘S / Ctrl+S: bypass the debounce and save immediately. Prevents the browser's
  // "save page as" dialog from stealing the shortcut.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (state.dirty) flushNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flushNow, state.dirty]);

  const openPreviewWindow = () => {
    // Named target so repeated clicks focus the existing tab instead of spawning dupes.
    // No window features passed — browsers open a new TAB in the same window by default;
    // passing `width`/`height` would force a popup window, which we don't want.
    window.open(`/preview/${id}`, `vr-preview-${id}`);
  };

  // One-click republish for an already-published resume. Bypasses the modal so
  // updating the live artifact feels as quick as autosave. Pending edits are
  // flushed first so the published HTML/PDF reflects the latest state.
  const doRepublish = useCallback(async () => {
    setRepublishing(true);
    const toastId = toast.loading('Updating published version…');
    try {
      if (state.dirty) await flushNow();
      const { data } = await api.publish(id);
      dispatch(actions.updateScalar({
        published: { slug: data.slug, publishedAt: new Date().toISOString() },
      }));
      const url = `https://${getConfig().publicHost}/resumes/${data.slug}.html`;
      toast.success('Updated', {
        id: toastId,
        description: url,
        action: { label: 'Copy', onClick: () => navigator.clipboard.writeText(url) },
      });
    } catch (err) {
      toast.error(`Update failed: ${err.message}`, { id: toastId });
    } finally {
      setRepublishing(false);
    }
  }, [id, state.dirty, flushNow]);

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--color-paper)]">
        <p role="alert" className="font-meta text-[var(--color-oxblood)]">Error · {error}</p>
      </main>
    );
  }
  if (!loaded) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--color-paper)]">
        <p className="font-meta">Loading…</p>
      </main>
    );
  }

  const supportsPhoto = TEMPLATES[state.resume.templateId]?.meta?.supportsPhoto;

  return (
    <main className="min-h-screen bg-[var(--color-paper)]">
      <header className="sticky top-0 z-10 bg-[var(--color-paper)]/95 backdrop-blur border-b border-[var(--color-rule)]">
        <div className="max-w-7xl mx-auto flex items-center gap-4 px-6 py-3">
          <Button variant="ghost" size="sm" asChild className="text-[var(--color-ink-faint)] -ml-2">
            <Link to="/"><ArrowLeft className="size-4" /> Shelf</Link>
          </Button>
          <Wordmark size="sm" className="hidden lg:block" />
          <div className="h-6 w-px bg-[var(--color-rule)] hidden lg:block" />
          <Input
            className="max-w-sm rounded-sm border-[var(--color-rule)] font-serif text-base"
            value={state.resume.title}
            onChange={(e) => dispatch(actions.updateScalar({ title: e.target.value }))}
            placeholder="Internal title"
          />
          <Select
            value={state.resume.templateId}
            onValueChange={(v) => dispatch(actions.updateScalar({ templateId: v }))}
          >
            <SelectTrigger className="w-32 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TEMPLATES).map(([tid, t]) => (
                <SelectItem key={tid} value={tid}>{t.meta.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={state.resume.paperSize}
            onValueChange={(v) => dispatch(actions.updateScalar({ paperSize: v }))}
          >
            <SelectTrigger className="w-24 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="Letter">Letter</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-3">
            <SaveStatusChip status={saveStatus} savedAt={savedAt} onRetry={flushNow} />
            {/* Published state splits into two affordances: the chip-button is the passive
                status (click → modal for URL inspection / unpublish), and the primary CTA
                becomes one-click "Update published" — overwrites the live artifact at the
                same slug without opening the modal, matching the autosave one-step ethos. */}
            {state.resume.published && (
              <button
                type="button"
                onClick={() => setPublishing(true)}
                title="Manage publication"
                className="font-meta inline-flex items-center gap-1.5 text-[var(--color-oxblood)] hover:underline"
              >
                <span className="inline-block size-1.5 rounded-full bg-[var(--color-oxblood)]" />
                Published
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={openPreviewWindow}
              className="text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]">
              <ExternalLink className="size-4" /> Open preview
            </Button>
            {state.resume.published ? (
              <Button size="sm" onClick={doRepublish} disabled={republishing}
                className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]">
                <Upload className="size-4" /> {republishing ? 'Updating…' : 'Update published'}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPublishing(true)}
                className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]">
                <Upload className="size-4" /> Publish
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <MetaChip className="mb-2">Composition</MetaChip>
        <h1 className="font-serif text-3xl font-light text-[var(--color-ink)]">
          {state.resume.title || <span className="italic text-[var(--color-ink-faint)]">Untitled</span>}
        </h1>
        <RuleLine variant="double" className="mt-6 mb-8" />

        <SectionList
          state={state}
          dispatch={dispatch}
          photoSlot={supportsPhoto
            ? <PhotoUpload resumeId={id} state={state} dispatch={dispatch} onUploaded={refetch} />
            : null}
        />
      </div>

      <PublishModal
        resume={state.resume}
        open={publishing}
        onOpenChange={setPublishing}
        onPublished={(data) => dispatch(actions.updateScalar({
          published: { slug: data.slug, publishedAt: new Date().toISOString() },
        }))}
        onRevoked={() => dispatch(actions.updateScalar({ published: null }))}
      />
    </main>
  );
};

export default Edit;
```

- [ ] **Step 2: Replace `SectionList.jsx` with editorial chrome**

```jsx
// packages/editor/src/editor/SectionList.jsx
// Sections rendered as rule-separated editorial blocks instead of shadcn cards.
// The per-section title is Fraunces; move/remove controls live in a subtle right
// rail. Body content sits on the canvas — no inner borders — so the form reads as
// one long composition rather than a stack of boxes.
import { useState } from 'react';
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { SECTION_TYPES, sectionTitle } from '@shared/section-types.js';
import { FORMS } from './forms';
import { actions } from './reducer';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';

const SectionList = ({ state, dispatch, photoSlot }) => {
  const [newType, setNewType] = useState('');
  // Section types can only appear once — each already owns a list internally (entries
  // for Experience, groups for Skills, etc.), and single-object sections (Contact,
  // Summary) are conceptually singular. Hide the used ones from the "Add" picker.
  const usedTypes = new Set(state.resume.sections.map((s) => s.type));
  const availableTypes = SECTION_TYPES.filter((t) => !usedTypes.has(t.id));
  const allUsed = availableTypes.length === 0;

  return (
    <div className="grid gap-10">
      {state.resume.sections.map((section, i) => {
        const Form = FORMS[section.type];
        if (!Form) {
          return (
            <p key={section.id} className="font-meta text-[var(--color-oxblood)]">
              Unknown section type · {section.type}
            </p>
          );
        }
        const isLast = i === state.resume.sections.length - 1;
        return (
          <article key={section.id} className="grid gap-5">
            <header className="flex items-start gap-4">
              <div className="flex-1 grid gap-2">
                <MetaChip>Section {i + 1} · {section.type}</MetaChip>
                <h2 className="font-serif text-2xl font-normal text-[var(--color-ink)]">
                  {sectionTitle(section)}
                </h2>
                <Input
                  className="h-8 text-sm max-w-sm rounded-sm border-[var(--color-rule-soft)]"
                  placeholder="override title"
                  value={section.customTitle ?? ''}
                  onChange={(e) => dispatch(actions.updateSection({
                    id: section.id,
                    patch: { customTitle: e.target.value || undefined },
                  }))}
                />
                <Label className="flex items-center gap-2 font-meta">
                  <Checkbox
                    checked={section.pageBreakBefore ?? false}
                    onCheckedChange={(v) => dispatch(actions.updateSection({
                      id: section.id,
                      patch: { pageBreakBefore: Boolean(v) },
                    }))}
                  />
                  Page break before
                </Label>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label="Move up"
                  onClick={() => dispatch(actions.moveSection({ id: section.id, direction: 'up' }))}
                  disabled={i === 0}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Move down"
                  onClick={() => dispatch(actions.moveSection({ id: section.id, direction: 'down' }))}
                  disabled={isLast}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove"
                  onClick={() => dispatch(actions.removeSection({ id: section.id }))}
                  className="text-[var(--color-oxblood)]">
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            <div className="pl-0 sm:pl-1">
              <Form
                data={section.data}
                onChange={(data) => dispatch(actions.updateSectionData({ id: section.id, data }))}
                photoSlot={section.type === 'contact' ? photoSlot : null}
              />
            </div>

            {!isLast && <RuleLine className="mt-4" />}
          </article>
        );
      })}

      <div className="grid gap-3 pt-6 border-t border-[var(--color-rule)]">
        <MetaChip>Add a section</MetaChip>
        {allUsed ? (
          <p className="font-serif italic text-[var(--color-ink-faint)]">
            Every section type is already in the composition. Remove one first to add another.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="w-64 rounded-sm"><SelectValue placeholder="Choose a type…" /></SelectTrigger>
              <SelectContent>
                {availableTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.defaultTitle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => {
                if (newType) {
                  dispatch(actions.addSection({ type: newType }));
                  setNewType('');
                }
              }}
              disabled={!newType}
              className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]"
            >
              <Plus className="size-4" /> Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SectionList;
```

- [ ] **Step 3: Refresh `PhotoUpload.jsx` styling**

Read the current `PhotoUpload.jsx`. Keep the upload logic intact; swap the visual wrapper so it fits the editorial chrome. Replace the outermost container and any shadcn card:

```jsx
// Replace the outermost wrapper element in PhotoUpload.jsx with:
<div className="grid gap-3 p-4 border border-dashed border-[var(--color-rule)] rounded-sm bg-[var(--color-paper-deep)]/40">
  {/* existing contents of the component, unchanged */}
</div>
```

And replace any `<Card>`/`<CardContent>` wrappers or `bg-muted` classes inside with plain `<div>`s so the editorial palette isn't muddied by shadcn defaults. Keep the file's size/hover states working; don't change the upload flow.

- [ ] **Step 4: Delete `Preview.jsx`**

Run: `rm packages/editor/src/editor/Preview.jsx`

- [ ] **Step 5: Visit `/edit/<some-existing-id>` and sanity-check**

Expected:
- Sticky top bar: back-to-shelf link, wordmark (desktop only), internal title input in Fraunces, template/paper selects, autosave status chip, "Open preview" button. Primary CTA is context-aware: **Publish** (opens modal) when unpublished, or a **● Published** chip-button (opens modal for URL inspection / unpublish) + an **Update published** primary button (one-click republish, no modal) when already published.
- Below: "Composition" meta chip (+ "Unsaved changes" chip when dirty), serif h1 of the title, double rule, section list.
- Each section is rule-separated (not card-boxed). Section title is Fraunces.
- Clicking "Open preview" opens a new window at `/preview/:id` sized roughly 900×1200. The preview window shows the resume rendered at full bleed. Typing in the editor updates the preview within ~100ms.
- Close the preview window; the editor continues to work.
- Open a fresh preview window — it requests state on mount, editor replies, preview hydrates.

- [ ] **Step 6: Lint**

Run: `cd packages/editor && yarn lint`
Expected: clean.

---

### Task 10: Publish modal + Pending + NotFound aesthetic pass

**Files:**
- Modify: `packages/editor/src/editor/PublishModal.jsx`
- Modify: `packages/editor/src/pages/Pending.jsx`
- Modify: `packages/editor/src/pages/NotFound.jsx`

- [ ] **Step 1: `PublishModal.jsx` — editorial tone + republish-without-unpublish**

Read the current modal. Replace its outer shadcn `DialogContent` body so the dialog feels like a typeset confirmation card: serif title + rule lines + mono URLs. Keep all logic (publish / revoke / copy-to-clipboard / toasts), and additionally expose a `doRepublish` action when the resume is already published — same `POST /resumes/{id}/publish` endpoint (idempotent on the slug; renderer test `republish: reuses existing slug` covers this), different toast label ("Updated"). The published-state footer becomes: primary **Update published** button (ink) + secondary **Unpublish** ghost link (oxblood) + Close. This means the user no longer has to unpublish-then-republish to overwrite the live artifact. Replace the dialog content region only — the trigger/control flow stays the same. Sketch of the new content layout:

```jsx
// Inside <DialogContent …>:
<DialogHeader className="space-y-2">
  <span className="font-meta">
    {resume.published ? 'Published' : 'Ready to publish'}
  </span>
  <DialogTitle className="font-serif text-2xl font-normal text-[var(--color-ink)]">
    {resume.published ? 'Manage publication' : 'Publish this résumé'}
  </DialogTitle>
  <DialogDescription className="text-sm text-[var(--color-ink-faint)]">
    {resume.published
      ? 'Share the URLs below, or retire the published artifacts from your shelf.'
      : 'Generate a static HTML + PDF at an unguessable URL. Readers need no login.'}
  </DialogDescription>
</DialogHeader>

<div className="h-px bg-[var(--color-rule)] my-4" aria-hidden="true" />

{/* Existing URL list / action buttons — restyle them:
    - list items: `<div class="flex items-center gap-3 py-2 border-b border-[var(--color-rule-soft)] last:border-0 font-meta">`
    - "Copy" buttons: `variant="ghost"` with mono label
    - Primary action button: `className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]"`
    - Destructive "Unpublish" button: `className="text-[var(--color-oxblood)]"`

    Footer when `result` is set (published state): render BOTH a primary
    "Update published" button (calls a new `doRepublish` handler hitting the
    same publish endpoint) AND the existing destructive "Unpublish" ghost.
    Footer when `result` is null (draft state): only the primary "Publish".
*/}
```

Adjust the existing JSX accordingly — don't rewrite the component from scratch. Keep every state, callback, and conditional branch that was there before.

- [ ] **Step 2: `Pending.jsx` — editorial single-column**

```jsx
// packages/editor/src/pages/Pending.jsx
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import Page from '@/components/editorial/Page';
import Wordmark from '@/components/editorial/Wordmark';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';

const Pending = () => {
  const { logout } = useAuth();
  return (
    <Page width="reading">
      <Wordmark size="md" />
      <RuleLine variant="double" className="mt-6 mb-8" />

      <MetaChip className="mb-3">Pending approval</MetaChip>
      <h2 className="font-serif text-3xl font-light text-[var(--color-ink)]">
        Your account is awaiting review.
      </h2>
      <p className="mt-4 font-serif italic text-[var(--color-ink-soft)]">
        The administrator has been notified by email. Once approved, this page will
        let you through to your shelf on next sign-in.
      </p>

      <div className="mt-10">
        <Button variant="outline" onClick={logout} className="rounded-sm">
          Sign out
        </Button>
      </div>
    </Page>
  );
};

export default Pending;
```

- [ ] **Step 3: `NotFound.jsx`**

```jsx
// packages/editor/src/pages/NotFound.jsx
import { Link } from 'react-router-dom';
import Page from '@/components/editorial/Page';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';

const NotFound = () => (
  <Page width="reading">
    <MetaChip className="mb-3">404 · Not found</MetaChip>
    <h1 className="font-serif text-5xl font-light text-[var(--color-ink)]">
      No such page in the catalog.
    </h1>
    <RuleLine variant="double" className="mt-6 mb-6" />
    <p className="font-serif italic text-[var(--color-ink-soft)]">
      The URL you followed doesn't correspond to anything on this site.
    </p>
    <Link
      to="/"
      className="mt-8 inline-block font-meta text-[var(--color-ink)] underline decoration-[var(--color-oxblood)] decoration-2 underline-offset-4"
    >
      Return to the shelf
    </Link>
  </Page>
);

export default NotFound;
```

- [ ] **Step 4: Lint + build**

```bash
cd packages/editor
yarn lint
yarn build
```
Expected: both clean. Build emits the new assets under `dist/assets/`. The 500kb-chunk warning is expected — it's already there pre-refactor.

---

### Task 11: Final walkthrough

**Files:** none (manual verification).

- [ ] **Step 1: Walk the entire flow locally**

Run: `yarn frontend:serve`

Sign out if signed in. Then:

1. `/login` — two-column hero, left pane has the huge serif wordmark with oxblood italic "Résumés", right pane has the Google button on a deeper paper tint. Click "Continue with Google" → signs in.
2. `/` — wordmark top-left, "New resume" + "Sign out" top-right, double rule, "Your shelf" heading, grid of paper cards. If no resumes exist yet, empty-state paper card with italic "Your shelf is empty."
3. `/new` — back link, "New document" meta chip + serif h1, template picker cards (active card gets ink border + "Selected" oxblood chip). Pick one, enter a title, click "Begin composition".
4. `/edit/:id` — sticky editorial bar with a mono save-status chip in the top-right rail. Body with "Composition" meta chip + serif title + double rule + section list. Add a few sections; every form field has a mono "RENDERS AS · …" ghost line under its label. The "Add a section" picker only lists types that aren't already in the composition; if every type is used, it shows a serif italic hint instead of the picker.
5. Type in any field. After ~1.5s the chip transitions `Unsaved` → `Saving…` → `Saved · just now`. Press ⌘S (or Ctrl+S) to flush immediately.
6. In Experience, enter year-only dates (`2019`, `2021`) — preview shows `2019 – 2021`, not `January 2019`. Enter `YYYY-MM` for full month rendering.
7. In an Experience entry, write a paragraph and a list of bullets in the Body textarea; preview shows a paragraph followed by a real `<ul>`. Indent with two spaces for nested bullets.
8. Click "Open preview" → new tab opens at `/preview/:id`, resume renders full-bleed. Type in the editor — preview updates live within ~100ms.
9. Click "Publish" → modal with serif title + rule separator + mono URLs. Confirm publish → modal now shows "Published" state and the action flips to "Unpublish".
10. Return to `/` → the card shows a "Published" tone=live meta chip with the oxblood dot.

- [ ] **Step 2: Deploy to production**

```bash
yarn frontend:deploy
```

Visit `https://visual-resumes.isnan.eu` → same flow end-to-end.

---

## Self-review checklist

- [ ] Paper-cream canvas + Fraunces headlines + Inter Tight body everywhere. No stray white backgrounds. No generic system font falling through.
- [ ] Only ONE accent colour in use — oxblood — reserved for published / active / destructive emphasis. No stray blues or greens.
- [ ] Rule lines replace shadcn `<Card>` borders on Dashboard rows, Edit sections, Pending, NotFound. Shadcn cards are acceptable inside modals and as form-control chrome only.
- [ ] Every form field has a FieldHint under its label. Hint strings come from `hints.js`, not inlined.
- [ ] Preview is a separate `/preview/:id` route. No inline `<Preview />` on `/edit/:id`. `packages/editor/src/editor/Preview.jsx` is deleted.
- [ ] Editing the resume updates the preview tab within ~100ms. Opening a preview tab when the edit page is already open hydrates instantly via the `request`/`state` channel exchange.
- [ ] Autosave fires 1.5s after the last edit. The status chip cycles `Unsaved` → `Saving…` → `Saved · Ns ago`. ⌘S / Ctrl+S flushes immediately. No manual Save button exists.
- [ ] Section-type picker on Edit hides types already present. When all 8 are used it shows the italic "Every section type is already in the composition" hint.
- [ ] Experience entries use a single markdown `body` textarea (paragraphs + nested bullets). Year-only dates (`2019`) render as `2019`, not `January 2019`.
- [ ] Login page is full-bleed (no shadcn Card-in-the-middle) and leads with the wordmark.
- [ ] `yarn lint` clean, `yarn build` succeeds, reducer tests still pass (`yarn test`).
- [ ] No `git commit` steps were executed.
- [ ] No references to sibling apps (cardgames-score, alexandria, resumes) appear in code or comments.

## Out of scope

- ⌘K command palette (explicitly deferred).
- New palette / accent beyond what's defined in `index.css` (the current oxblood stays).
- Template thumbnails on `/new` (would need preview PNGs; the descriptions are sufficient for now).
- Drag-and-drop section reordering.
- Mobile-optimised editor layout below `sm:` — the sticky header controls wrap less than ideally on a phone, but the product is laptop-first.
