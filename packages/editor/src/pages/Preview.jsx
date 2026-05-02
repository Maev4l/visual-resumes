// packages/editor/src/pages/Preview.jsx
// Dedicated preview window at /preview/:id. Renders the resume full-bleed using the
// shared preview renderer. Receives state live from the Edit page via BroadcastChannel;
// on first mount it posts a `request` so the editor replays current state.
//
// If the user navigates here directly (no editor open), we fall back to fetching from
// the API so the URL still works as a shareable authoring preview.
//
// URL toggles:
//  - ?picture=true → include the photo (default: hidden to match the published HTML)
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { renderPreviewHtml } from '@/preview-renderer';
import { PREVIEW_CHANNEL } from '@/editor/useBroadcastPreview';

const Preview = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [resume, setResume] = useState(null);
  const [photoDataUri, setPhotoDataUri] = useState(null);
  const [error, setError] = useState(null);

  // Same semantics as the published HTML: photo is HIDDEN by default; `?picture=true`
  // opts in. Sharing a bare URL gives a photo-less version.
  const showPhoto = searchParams.get('picture') === 'true';

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

  const togglePhoto = () => {
    const next = new URLSearchParams(searchParams);
    if (showPhoto) next.delete('picture'); else next.set('picture', 'true');
    setSearchParams(next, { replace: true });
  };

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
    // _photoVisible drives the `no-photo` class server-side because the published
    // HTML's runtime `?picture=true` toggle can't fire inside a srcDoc iframe
    // (location is `about:srcdoc`). Renderer Lambda omits this flag, so published
    // HTML retains the privacy-by-default class as before.
    html = renderPreviewHtml({
      ...resume,
      _photoSrc: showPhoto ? (photoDataUri ?? null) : null,
      _photoVisible: showPhoto,
    });
  } catch (err) {
    html = `<!doctype html><body style="font-family:ui-monospace,monospace;padding:1rem;color:#7A1F1F"><pre>${err.message}</pre></body>`;
  }

  const chipClass =
    'font-meta px-3 py-1.5 rounded-sm border border-[var(--color-rule)] bg-[var(--color-paper)] ' +
    'text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-deep)] hover:border-[var(--color-ink-faint)] ' +
    'transition-colors shadow-[0_1px_0_var(--color-rule-soft)]';

  return (
    <div className="relative w-screen h-screen">
      <iframe
        title="preview"
        srcDoc={html}
        sandbox="allow-same-origin"
        className="absolute inset-0 w-full h-full border-0 bg-white"
      />
      <div className="absolute top-3 right-3 z-10">
        <button type="button" onClick={togglePhoto} className={chipClass} aria-pressed={!showPhoto}>
          {showPhoto ? 'Photo · on' : 'Photo · off'}
        </button>
      </div>
    </div>
  );
};

export default Preview;
