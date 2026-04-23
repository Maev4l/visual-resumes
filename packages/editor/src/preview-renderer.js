// Thin editor-side wrapper over the shared renderer.
// WHY the cache: createRenderer compiles Handlebars on construction, which is
// non-trivial for larger templates. Keying on the template object IDENTITY means
// Vite HMR (which replaces the TEMPLATES entries when a .hbs or .css changes)
// transparently invalidates the cache without us having to wire up HMR hooks.
import { createRenderer } from '@shared/renderer.js';
import { TEMPLATES } from './templates.js';

const cache = new Map(); // id → { t, render }

export const renderPreviewHtml = (resume) => {
  const t = TEMPLATES[resume.templateId];
  if (!t) throw new Error(`unknown template: ${resume.templateId}`);
  const cached = cache.get(resume.templateId);
  if (cached && cached.t === t) return cached.render(resume);
  const render = createRenderer(t);
  cache.set(resume.templateId, { t, render });
  return render(resume);
};
