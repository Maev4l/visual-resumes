// Usage: TEMPLATES_DIR=../templates node src/local-render.js <path-to-resume.json>
// Prints rendered HTML to stdout. No PDF generation.
import fs from 'node:fs';
import path from 'node:path';
import { renderFromDisk } from '../../../shared/renderer.node.js';

const [, , jsonPath] = process.argv;
if (!jsonPath) {
  console.error('usage: local-render.js <resume.json>');
  process.exit(1);
}

const templatesDir = process.env.TEMPLATES_DIR ?? path.join(process.cwd(), 'packages', 'templates');

const resume = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const html = renderFromDisk({ templatesDir, resume });
process.stdout.write(html);
