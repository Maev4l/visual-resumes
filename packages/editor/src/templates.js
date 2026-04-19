// Template registry for the editor.
// WHY ?raw imports: Vite inlines the source text at build time so the shared renderer
// can compile templates at runtime without a filesystem — same module ships to the
// browser and (if needed) to server-side tooling unchanged.
import monacoHbs  from '@templates/monaco/template.hbs?raw';
import monacoCss  from '@templates/monaco/style.css?raw';
import monacoMeta from '@templates/monaco/meta.json';
import modernHbs  from '@templates/modern/template.hbs?raw';
import modernCss  from '@templates/modern/style.css?raw';
import modernMeta from '@templates/modern/meta.json';
import avantHbs   from '@templates/avant/template.hbs?raw';
import avantCss   from '@templates/avant/style.css?raw';
import avantMeta  from '@templates/avant/meta.json';

export const TEMPLATES = {
  monaco: { templateSource: monacoHbs, style: monacoCss, meta: monacoMeta },
  modern: { templateSource: modernHbs, style: modernCss, meta: modernMeta },
  avant:  { templateSource: avantHbs,  style: avantCss,  meta: avantMeta  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);
