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
