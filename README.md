# visual-resumes

Authoring tool for visual CVs, served at `visual-resumes.isnan.eu`.

- Spec: `docs/superpowers/specs/2026-04-18-visual-cv-design.md`
- Plans: `docs/superpowers/plans/`

## Packages

- `packages/editor` — Vite + React SPA
- `packages/functions` — Lambda handlers (`api`, `renderer`, `image-resizer`)
- `packages/shared` — Handlebars renderer, schema, section types (imported via relative path)
- `packages/templates` — resume templates (static files)
- `packages/infrastructure` — Terraform

## Prerequisites

See `packages/infrastructure/README.md`.

## Development

- `yarn frontend:dev` — run editor against the deployed API
- `yarn infra:plan` — preview Terraform changes
- `yarn deploy` — full deploy (backend then frontend)
