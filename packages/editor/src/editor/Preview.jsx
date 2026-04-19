// Iframe-based live preview of the resume.
// WHY `srcDoc` + `sandbox`: we inline the rendered HTML so no extra server roundtrip is
// needed per keystroke, and sandboxing isolates template CSS from the editor chrome.
// `allow-same-origin` without `allow-scripts` intentionally disables the template's
// publish-only `?picture=false` toggle — preview is for layout, not print flags.
import { useMemo } from 'react';
import { renderPreviewHtml } from '@/preview-renderer';

const Preview = ({ resume, photoDataUri }) => {
  const html = useMemo(() => {
    try {
      // `_photoSrc` matches the convention the publish-time renderer Lambda uses, so
      // the template can reference a single photo source regardless of origin.
      return renderPreviewHtml({ ...resume, _photoSrc: photoDataUri ?? null });
    } catch (err) {
      return `<!doctype html><body style="font-family:ui-monospace,monospace;padding:1rem;color:#b00020"><pre>${err.message}</pre></body>`;
    }
  }, [resume, photoDataUri]);

  return (
    <div className="h-full rounded-md border bg-white overflow-hidden">
      <iframe
        title="preview"
        srcDoc={html}
        sandbox="allow-same-origin"
        className="w-full h-full"
      />
    </div>
  );
};

export default Preview;
