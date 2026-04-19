// Node-only convenience wrappers around the isomorphic renderer core.
// WHY this file exists separately: keeping fs/path out of renderer.js lets the browser
// bundle (Vite in the editor) tree-shake cleanly without polyfills.
import fs from 'node:fs';
import path from 'node:path';
import { createRenderer } from './renderer.js';

export const loadTemplate = (templatesDir, templateId) => {
  const dir = path.join(templatesDir, templateId);
  const read = (f) => {
    try {
      return fs.readFileSync(path.join(dir, f), 'utf8');
    } catch (err) {
      // Include the templateId so renderer Lambda logs (Plan 5) surface the failure clearly.
      throw new Error(`Failed to load ${f} for template "${templateId}" under ${templatesDir}: ${err.message}`);
    }
  };
  return {
    templateSource: read('template.hbs'),
    style:          read('style.css'),
    meta:           JSON.parse(read('meta.json')),
  };
};

export const renderFromDisk = ({ templatesDir, resume }) => {
  const parts = loadTemplate(templatesDir, resume.templateId);
  return createRenderer(parts)(resume);
};
