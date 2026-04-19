// Thin editor-side wrapper over the shared renderer.
// WHY the cache: createRenderer compiles Handlebars on construction, which is
// non-trivial for larger templates. Keying by templateId lets us keep a hot renderer
// per template so preview repaints during typing don't re-compile on every keystroke.
import { createRenderer } from '@shared/renderer.js';
import { TEMPLATES } from './templates.js';

const cache = new Map();

export const renderPreviewHtml = (resume) => {
  const t = TEMPLATES[resume.templateId];
  if (!t) throw new Error(`unknown template: ${resume.templateId}`);
  let render = cache.get(resume.templateId);
  if (!render) {
    render = createRenderer(t);
    cache.set(resume.templateId, render);
  }
  return render(resume);
};
