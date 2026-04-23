// Contact-section photo upload widget.
// WHY three-step flow: the API hands back a presigned S3 URL (1), the browser PUTs the
// raw file to it (2), and a downstream image-resizer Lambda asynchronously normalises
// the upload into users/<customId>/photos/<resumeId>.webp (3). We set `photoKey` on the
// resume immediately so subsequent saves persist it, and schedule a refetch so the
// new photoDataUri shows up in the preview once the resizer finishes (~1s).
import { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

import { api, uploadPhoto } from '@/api/client';
import { actions } from './reducer';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

const PhotoUpload = ({ resumeId, state, dispatch, onSaveNow, onUploaded }) => {
  const [busy, setBusy] = useState(false);

  const onChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) { toast.error('Max 5 MB'); return; }

    setBusy(true);
    try {
      const { data } = await api.photoUploadUrl(resumeId);
      await uploadPhoto({ uploadUrl: data.uploadUrl, file });
      // Update the reducer for UI purposes AND save with an explicit override —
      // waiting on React to commit the dispatch before flushNow reads its ref would
      // race. Pass the computed resume directly so the save is deterministic.
      dispatch(actions.setPhotoKey(data.photoKey));
      if (onSaveNow) {
        await onSaveNow({
          resume: { ...state.resume, photoKey: data.photoKey },
          etag: state.etag,
        });
      }
      toast.success('Photo uploaded — processing…');
      if (onUploaded) await onUploaded();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      // Reset the input so re-uploading the same file still fires onChange.
      e.target.value = '';
    }
  };

  const clear = () => dispatch(actions.setPhotoKey(null));

  // Editorial wrapper: dashed rule on paper-deep tint so the upload reads as a
  // distinct surface without the shadcn Card chrome muddying the palette.
  return (
    <div className="grid gap-3 p-4 border border-dashed border-[var(--color-rule)] rounded-sm bg-[var(--color-paper-deep)]/40">
      <Label>Photo</Label>
      <Input type="file" accept={ACCEPT} onChange={onChange} disabled={busy} />
      {busy && <span className="font-meta text-[var(--color-ink-faint)]">Uploading…</span>}
      {state.resume.photoKey && !busy && (
        <div className="flex items-center gap-2 font-meta text-[var(--color-ink-faint)]">
          <code className="font-mono text-xs px-1 rounded-sm bg-[var(--color-paper)] border border-[var(--color-rule-soft)]">
            {state.resume.photoKey}
          </code>
          <Button type="button" variant="ghost" size="sm" onClick={clear}>Remove</Button>
        </div>
      )}
    </div>
  );
};

export default PhotoUpload;
