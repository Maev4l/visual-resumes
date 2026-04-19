// Main editor page — sticky header with scalar controls, section list, optional split
// preview, and publish dialog. WHY `useReducer`: the resume state is graph-shaped
// (sections with nested lists) so centralising every mutation in one reducer keeps the
// Edit page declarative and makes every edit traceable to one action type.
import { useEffect, useReducer, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, Save, Upload } from 'lucide-react';

import { api, ApiError } from '@/api/client';
import { reducer, initialState, actions } from '@/editor/reducer';
import SectionList from '@/editor/SectionList';
import PhotoUpload from '@/editor/PhotoUpload';
import Preview from '@/editor/Preview';
import PublishModal from '@/editor/PublishModal';
import { TEMPLATES } from '@/templates';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const Edit = () => {
  const { id } = useParams();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [photoDataUri, setPhotoDataUri] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // `refetch` is reusable — photo upload calls it to pick up the newly-resized WebP,
  // and the stale-etag branch of `save` calls it to resync with the server.
  const refetch = () => api.getResume(id).then(({ data }) => {
    dispatch(actions.hydrate({ resume: data.resume, etag: data.etag }));
    setPhotoDataUri(data.photoDataUri ?? null);
    setLoaded(true);
  });

  useEffect(() => { refetch().catch((err) => setError(err.message)); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      const { etag } = await api.putResume(id, state.resume, state.etag);
      dispatch(actions.saved(etag));
      toast.success('Saved');
    } catch (err) {
      // 412 = someone else (or another tab) wrote first; rehydrate instead of
      // silently overwriting their edit.
      if (err instanceof ApiError && err.status === 412) {
        toast.warning('Your copy is stale — reloading');
        await refetch();
      } else {
        toast.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p role="alert" className="text-destructive">Error: {error}</p>
      </main>
    );
  }
  if (!loaded) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const supportsPhoto = TEMPLATES[state.resume.templateId]?.meta?.supportsPhoto;

  return (
    <main className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-7xl mx-auto flex items-center gap-3 p-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/"><ArrowLeft className="size-4" /> Back</Link>
          </Button>
          <Input
            className="max-w-md"
            value={state.resume.title}
            onChange={(e) => dispatch(actions.updateScalar({ title: e.target.value }))}
            placeholder="Internal title"
          />
          <Select
            value={state.resume.templateId}
            onValueChange={(v) => dispatch(actions.updateScalar({ templateId: v }))}
          >
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
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
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="Letter">Letter</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
              {showPreview
                ? <><EyeOff className="size-4" /> Hide preview</>
                : <><Eye className="size-4" /> Preview</>}
            </Button>
            <Button variant="outline" size="sm" onClick={save} disabled={!state.dirty || saving}>
              <Save className="size-4" /> {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" onClick={() => setPublishing(true)}>
              <Upload className="size-4" /> Publish
            </Button>
          </div>
        </div>
      </header>

      <div className={`max-w-7xl mx-auto p-4 grid gap-4 ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        <section>
          <SectionList
            state={state}
            dispatch={dispatch}
            photoSlot={supportsPhoto
              ? <PhotoUpload resumeId={id} state={state} dispatch={dispatch} onUploaded={refetch} />
              : null}
          />
        </section>

        {showPreview && (
          <aside className="lg:sticky lg:top-[68px] lg:self-start lg:h-[calc(100vh-80px)]">
            <Preview resume={state.resume} photoDataUri={photoDataUri} />
          </aside>
        )}
      </div>

      <PublishModal
        resume={state.resume}
        open={publishing}
        onOpenChange={setPublishing}
        onPublished={(data) => dispatch(actions.updateScalar({
          published: { slug: data.slug, publishedAt: new Date().toISOString() },
        }))}
        onRevoked={() => dispatch(actions.updateScalar({ published: null }))}
      />
    </main>
  );
};

export default Edit;
