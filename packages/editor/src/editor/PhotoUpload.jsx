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

const PhotoUpload = ({ resumeId, state, dispatch, onUploaded }) => {
  const [busy, setBusy] = useState(false);

  const onChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) { toast.error('Max 5 MB'); return; }

    setBusy(true);
    try {
      const { data } = await api.photoUploadUrl(resumeId);
      await uploadPhoto({ uploadUrl: data.uploadUrl, file });
      dispatch(actions.setPhotoKey(data.photoKey));
      toast.success('Photo uploaded — processing…');
      // Short delay so the image-resizer has time to produce the WebP before we refetch
      // (direct S3 listing would be overkill; a best-effort timeout is sufficient here).
      if (onUploaded) setTimeout(onUploaded, 1500);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      // Reset the input so re-uploading the same file still fires onChange.
      e.target.value = '';
    }
  };

  const clear = () => dispatch(actions.setPhotoKey(null));

  return (
    <div className="grid gap-2">
      <Label>Photo</Label>
      <Input type="file" accept={ACCEPT} onChange={onChange} disabled={busy} />
      {busy && <span className="text-sm text-muted-foreground">Uploading…</span>}
      {state.resume.photoKey && !busy && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <code className="bg-muted px-1 rounded text-xs">{state.resume.photoKey}</code>
          <Button type="button" variant="ghost" size="sm" onClick={clear}>Remove</Button>
        </div>
      )}
    </div>
  );
};

export default PhotoUpload;
