# Per-entry page break in Experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No commits.** Do NOT run `git add`, `git commit`, or `git push` at any point. Leave all changes staged/unstaged for the user to review and commit manually.

> **No automated component tests.** This codebase has no component-level tests today. The new behavior is verified by code review of the small JSX change + a manual browser smoke at the end. Spec: `docs/superpowers/specs/2026-05-02-experience-entry-page-break-design.md`.

**Goal:** Add a per-entry "Page break before" toggle in the Experience form, mirroring the existing section-level UX.

**Architecture:** Editor-only change. Templates already render `{{#if pageBreakBefore}}` inside the experience `{{#each data}}` loop, so no template/renderer/Lambda work. Two source files touched (schema + ExperienceForm). No new reducer action — entry edits already flow through the form's existing `patch()` → `onChange(list)` plumbing.

**Tech Stack:** React 18, JSON Schema draft-07. No new dependencies; in fact this plan also prunes `@testing-library/react`, `@testing-library/user-event`, `@testing-library/dom` from `packages/editor/package.json`, since they were declared but never imported by any test.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `packages/shared/schema/resume.schema.json` | Modify | Document the new `pageBreakBefore` field on the `experienceEntry` definition. |
| `packages/editor/src/editor/forms/ExperienceForm.jsx` | Modify | Render the conditional checkbox between header and field grid; seed `pageBreakBefore: false` on `add()`. |
| `packages/editor/package.json` | Modify | Prune three unused testing-library dev dependencies. |

No tests are added or modified. Templates, the renderer Lambda, the API Lambda, the reducer, and existing tests are all untouched.

---

## Task 1: Schema — document `pageBreakBefore` on `experienceEntry`

**Status:** ✅ already complete in this branch (uncommitted) — the schema property was added and `yarn test` passed at 141/141. Skip if you're picking up a fresh branch.

**Files:**
- Modify: `packages/shared/schema/resume.schema.json`

- [ ] **Step 1: Edit the schema**

In `packages/shared/schema/resume.schema.json`, locate the `experienceEntry` definition and append `pageBreakBefore` to its `properties`. The full updated block:

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

Don't touch `educationEntry`, `projectEntry`, `languageEntry`, or `certificationEntry` — out of scope per spec.

- [ ] **Step 2: Run the full test suite to make sure nothing regresses**

```bash
yarn test
```

Expected: 141/141 passing.

- [ ] **Step 3: Stop for review** (no commit).

---

## Task 2: `ExperienceForm.jsx` — conditional checkbox + `add()` seed

**Files:**
- Modify: `packages/editor/src/editor/forms/ExperienceForm.jsx`

- [ ] **Step 1: Update `add()` to seed the new field**

Locate the `add` arrow function (currently around lines 25-27) and update it so newly-added entries always include `pageBreakBefore: false`:

```jsx
const add = () => onChange([...list, {
  company: '', role: '', location: '',
  startDate: '', endDate: '', current: false,
  body: '',
  pageBreakBefore: false,
}]);
```

- [ ] **Step 2: Insert the conditional checkbox between the entry header row and the field grid**

In the same file, find the entry header `<div className="flex items-center justify-between">` block and the following `<div className="grid sm:grid-cols-2 gap-4">` field grid. Between them, insert a conditional toggle. The relevant section after editing:

```jsx
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

    {/* Hidden on entry 1: a break before the first entry overlaps with the
        section-level pageBreakBefore (the heading sits between any preceding
        content and the first entry), so exposing both creates two ways to
        spell the same intent. Same component pattern as SectionList.jsx:58-67. */}
    {i > 0 && (
      <Label className="flex items-center gap-2 font-meta">
        <Checkbox
          checked={entry.pageBreakBefore ?? false}
          onCheckedChange={(v) => patch(i, { pageBreakBefore: Boolean(v) })}
        />
        Page break before
      </Label>
    )}

    <div className="grid sm:grid-cols-2 gap-4">
      {/* … company / role / location / dates / current — UNCHANGED … */}
    </div>

    <div className="grid gap-1.5">
      {/* … body textarea — UNCHANGED … */}
    </div>
  </div>
))}
```

`Label` and `Checkbox` are already imported at the top of the file (used by the "Currently here" checkbox). No new imports.

- [ ] **Step 3: Run the editor tests + lint**

```bash
yarn --cwd packages/editor test
yarn --cwd packages/editor lint
```

Expected: tests still at 11/11 (no test additions); lint clean.

- [ ] **Step 4: Stop for review** (no commit).

---

## Task 3: Final verification — full suite, lint, prune unused deps, manual smoke

**Files:**
- Modify (already done in this branch): `packages/editor/package.json` — pruned `@testing-library/react`, `@testing-library/user-event`, `@testing-library/dom`.
- Modify (already done): `packages/editor/yarn.lock` — regenerated by `yarn install`.

If `package.json` still contains the three testing-library entries when you start, perform Step 1; otherwise skip to Step 2.

- [ ] **Step 1 (only if needed): Prune unused testing-library deps**

In `packages/editor/package.json`, remove these three lines from `devDependencies`:

```json
"@testing-library/dom": "10.4.1",
"@testing-library/react": "16.1.0",
"@testing-library/user-event": "14.5.2",
```

Then regenerate the lockfile:

```bash
cd packages/editor && yarn install
```

- [ ] **Step 2: Run the entire monorepo test suite**

```bash
yarn test
```

Expected: 141/141 across all workspaces (same as the pre-plan baseline; this plan adds no tests).

- [ ] **Step 3: Run all linters**

```bash
yarn lint
```

Expected: no errors.

- [ ] **Step 4: Manual smoke in the running editor**

The user keeps `yarn frontend:serve` running on port 5178 (per `vite.config.js`'s `strictPort`); HMR should pick up the changes automatically. In a browser:

1. Open an existing resume that has an Experience section with at least two entries.
2. Verify entry 1 shows no "Page break before" checkbox.
3. Verify entries 2+ each show one.
4. Tick the checkbox on entry 2; confirm the autosave indicator briefly flips to "Saving…" then "Saved · just now".
5. Open the preview window (or refresh it). Confirm the rendered HTML now includes a `<div class="page-break"></div>` immediately before the second job entry. Inspect the iframe DOM if necessary.
6. Click "Add entry" at the bottom of the Experience form; confirm the newly added entry also shows the "Page break before" checkbox (it will, since it becomes entry index N>0).

If any step fails, stop and surface the discrepancy. Otherwise the feature is complete.

- [ ] **Step 5: Stop for final review**

Tell the user the implementation is complete and ready for them to review the diff and commit. Do not commit yourself.

---

## Out of scope (do not implement)

- Toggles on Education / Projects / Certifications (per spec scope decision A).
- Backfill / migration of pre-existing resumes — the Handlebars `{{#if pageBreakBefore}}` already short-circuits on `undefined`, so legacy entries render unchanged.
- Changes to the renderer Lambda, the API Lambda, the templates, or the reducer.
- Keyboard shortcut, context menu, or any other affordance beyond the checkbox.
- Any automated component test for the new checkbox behavior — covered by code review + manual smoke.
