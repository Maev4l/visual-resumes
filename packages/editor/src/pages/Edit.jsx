// packages/editor/src/pages/Edit.jsx
// Main editor page. The header is a sticky editorial bar (wordmark left, title input
// centre, controls right). Inline preview is gone: "Open preview" opens a dedicated
// window at /preview/:id which stays synchronised via BroadcastChannel. No Save button:
// edits autosave on a 1.5s debounce; a mono status chip in the header rail shows
// "Unsaved" → "Saving…" → "Saved · Ns ago" live. ⌘S (or Ctrl+S) flushes immediately.
import { useCallback, useEffect, useReducer, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/api/client';
import { getConfig } from '@/config';
import { reducer, initialState, actions } from '@/editor/reducer';
import { useBroadcastPreview } from '@/editor/useBroadcastPreview';
import { useAutosave } from '@/editor/useAutosave';
import SectionList from '@/editor/SectionList';
import PhotoUpload from '@/editor/PhotoUpload';
import PublishModal from '@/editor/PublishModal';
import { TEMPLATES } from '@/templates';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Wordmark from '@/components/editorial/Wordmark';
import MetaChip from '@/components/editorial/MetaChip';
import RuleLine from '@/components/editorial/RuleLine';
import SaveStatusChip from '@/components/editorial/SaveStatusChip';

const Edit = () => {
  const { id } = useParams();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [photoDataUri, setPhotoDataUri] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [republishing, setRepublishing] = useState(false);

  // Publish resume state over BroadcastChannel to any /preview/:id window.
  useBroadcastPreview({ resumeId: id, resume: state.resume, photoDataUri });

  // When `waitForPhoto` is true we poll until the API returns a non-null photoDataUri.
  // Post-upload the image-resizer Lambda needs a second or two to produce the WebP,
  // during which the API returns `photoDataUri: null`. Without the poll the preview
  // would show no image until the next unrelated refetch. Bounded to avoid hangs if
  // the resizer fails — the photo just stays missing, consistent with the rest of the
  // "best-effort" upload UX.
  const refetch = useCallback(async ({ waitForPhoto = false } = {}) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data } = await api.getResume(id);
      dispatch(actions.hydrate({ resume: data.resume, etag: data.etag }));
      setPhotoDataUri(data.photoDataUri ?? null);
      setLoaded(true);
      if (!waitForPhoto || !data.resume.photoKey || data.photoDataUri) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }, [id]);

  useEffect(() => { refetch().catch((err) => setError(err.message)); }, [refetch]);

  const onSaved = useCallback((etag) => dispatch(actions.saved(etag)), []);

  const { status: saveStatus, savedAt, flushNow } = useAutosave({
    resumeId: id,
    resume: state.resume,
    etag: state.etag,
    dirty: state.dirty,
    onSaved,
    onStale: refetch,
  });

  // ⌘S / Ctrl+S: bypass the debounce and save immediately. Prevents the browser's
  // "save page as" dialog from stealing the shortcut.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (state.dirty) flushNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flushNow, state.dirty]);

  const openPreviewWindow = () => {
    // Named target so repeated clicks focus the existing tab instead of spawning dupes.
    // No window features passed — browsers open a new TAB in the same window by default;
    // passing `width`/`height` would force a popup window instead, which we don't want.
    window.open(`/preview/${id}`, `vr-preview-${id}`);
  };

  // One-click republish for an already-published resume. Bypasses the modal so
  // updating the live artifact feels as quick as autosave. Pending edits are
  // flushed first so the published HTML/PDF reflects the latest state.
  // WHY refetch on conflict: the renderer's back-write 412'd because something
  // wrote the resume JSON during publish — our local etag is stale and we don't
  // know the authoritative state, so resync rather than dispatch a guess.
  const doRepublish = useCallback(async () => {
    setRepublishing(true);
    const toastId = toast.loading('Updating published version…');
    try {
      if (state.dirty) await flushNow();
      const { data, etag: newEtag } = await api.publish(id);
      if (newEtag) {
        dispatch(actions.republished({
          etag: newEtag,
          published: { slug: data.slug, publishedAt: new Date().toISOString() },
        }));
      } else {
        await refetch();
      }
      const url = `https://${getConfig().publicHost}/resumes/${data.slug}.html`;
      toast.success('Updated', {
        id: toastId,
        description: url,
        action: { label: 'Copy', onClick: () => navigator.clipboard.writeText(url) },
      });
    } catch (err) {
      toast.error(`Update failed: ${err.message}`, { id: toastId });
    } finally {
      setRepublishing(false);
    }
  }, [id, state.dirty, flushNow, refetch]);

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--color-paper)]">
        <p role="alert" className="font-meta text-[var(--color-oxblood)]">Error · {error}</p>
      </main>
    );
  }
  if (!loaded) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--color-paper)]">
        <p className="font-meta">Loading…</p>
      </main>
    );
  }

  const supportsPhoto = TEMPLATES[state.resume.templateId]?.meta?.supportsPhoto;

  return (
    <main className="min-h-screen bg-[var(--color-paper)]">
      <header className="sticky top-0 z-10 bg-[var(--color-paper)]/95 backdrop-blur border-b border-[var(--color-rule)]">
        <div className="max-w-7xl mx-auto flex items-center gap-4 px-6 py-3">
          <Button variant="ghost" size="sm" asChild className="text-[var(--color-ink-faint)] -ml-2">
            <Link to="/"><ArrowLeft className="size-4" /> Shelf</Link>
          </Button>
          <Wordmark size="sm" className="hidden lg:block" />
          <div className="h-6 w-px bg-[var(--color-rule)] hidden lg:block" />
          <Input
            className="max-w-sm rounded-sm border-[var(--color-rule)] font-serif text-base"
            value={state.resume.title}
            onChange={(e) => dispatch(actions.updateScalar({ title: e.target.value }))}
            placeholder="Internal title"
          />
          <Select
            value={state.resume.templateId}
            onValueChange={(v) => dispatch(actions.updateScalar({ templateId: v }))}
          >
            <SelectTrigger className="w-32 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TEMPLATES).map(([tid, t]) => (
                <SelectItem key={tid} value={tid}>{t.meta.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={state.resume.paperSize}
            onValueChange={(v) => dispatch(actions.updateScalar({ paperSize: v }))}
          >
            <SelectTrigger className="w-24 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="Letter">Letter</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-3">
            <SaveStatusChip status={saveStatus} savedAt={savedAt} onRetry={flushNow} />
            {/* Published state splits into two affordances: the chip-button is the passive
                status (click → modal for URL inspection / unpublish), and the primary CTA
                becomes one-click "Update published" — overwrites the live artifact at the
                same slug without opening the modal, matching the autosave one-step ethos. */}
            {state.resume.published && (
              <button
                type="button"
                onClick={() => setPublishing(true)}
                title="Manage publication"
                className="font-meta inline-flex items-center gap-1.5 text-[var(--color-oxblood)] hover:underline"
              >
                <span className="inline-block size-1.5 rounded-full bg-[var(--color-oxblood)]" />
                Published
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={openPreviewWindow}
              className="text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]">
              <ExternalLink className="size-4" /> Open preview
            </Button>
            {state.resume.published ? (
              <Button size="sm" onClick={doRepublish} disabled={republishing}
                className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]">
                <Upload className="size-4" /> {republishing ? 'Updating…' : 'Update published'}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPublishing(true)}
                className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]">
                <Upload className="size-4" /> Publish
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <MetaChip className="mb-2">Composition</MetaChip>
        <h1 className="font-serif text-3xl font-light text-[var(--color-ink)]">
          {state.resume.title || <span className="italic text-[var(--color-ink-faint)]">Untitled</span>}
        </h1>
        <RuleLine variant="double" className="mt-6 mb-8" />

        <SectionList
          state={state}
          dispatch={dispatch}
          photoSlot={supportsPhoto
            ? <PhotoUpload
                resumeId={id}
                state={state}
                dispatch={dispatch}
                onSaveNow={flushNow}
                onUploaded={() => refetch({ waitForPhoto: true })}
              />
            : null}
        />
      </div>

      <PublishModal
        resume={state.resume}
        open={publishing}
        onOpenChange={setPublishing}
        // The publish API rotates the resume-JSON etag (back-writes `published`).
        // Apply both fields atomically here so no stale-etag autosave follows the dialog.
        onPublished={({ data, etag: newEtag }) => {
          if (newEtag) {
            dispatch(actions.republished({
              etag: newEtag,
              published: { slug: data.slug, publishedAt: new Date().toISOString() },
            }));
          } else {
            // Back-write conflict during publish — server state is unknown, refetch.
            refetch();
          }
        }}
        onRevoked={() => dispatch(actions.updateScalar({ published: null }))}
      />
    </main>
  );
};

export default Edit;
