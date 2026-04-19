// Publish / unpublish dialog.
// WHY state is local: the parent (`Edit`) owns the resume and passes `onPublished` /
// `onRevoked` so publish status persists in the reducer. This modal just drives the
// API calls and surfaces the shareable URLs; it doesn't need its own store.
import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';

import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const PublishModal = ({ resume, open, onOpenChange, onPublished, onRevoked }) => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(resume.published ? { slug: resume.published.slug } : null);

  const doPublish = async () => {
    setBusy(true);
    try {
      const { data } = await api.publish(resume.id);
      setResult(data);
      onPublished(data);
      toast.success('Published');
    } catch (err) {
      toast.error(`Publish failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const doUnpublish = async () => {
    setBusy(true);
    try {
      await api.revoke(resume.id);
      setResult(null);
      onRevoked?.();
      toast.success('Unpublished');
    } catch (err) {
      toast.error(`Unpublish failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  // Published URLs live under the same host as the editor (CloudFront serves both).
  const host = window.location.host;
  const urls = result ? {
    html: `https://${host}/resumes/${result.slug}.html`,
    pdf:  `https://${host}/resumes/${result.slug}.pdf`,
  } : null;

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result ? 'Published' : 'Publish resume'}</DialogTitle>
          <DialogDescription>
            {result ? 'Your resume is live.' : 'This generates the public HTML + PDF at a shareable URL.'}
          </DialogDescription>
        </DialogHeader>

        {urls && (
          <div className="grid gap-3">
            {['html', 'pdf'].map((kind) => (
              <div key={kind} className="grid gap-1">
                <label className="text-sm text-muted-foreground uppercase">{kind}</label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={urls[kind]}
                    onFocus={(e) => e.target.select()}
                    className="font-mono text-sm"
                  />
                  <Button type="button" variant="outline" size="icon" aria-label="Copy"
                    onClick={() => copy(urls[kind])}>
                    <Copy className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" aria-label="Open" asChild>
                    <a href={urls[kind]} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {!result && (
            <Button type="button" onClick={doPublish} disabled={busy}>
              {busy ? 'Publishing…' : 'Publish'}
            </Button>
          )}
          {result && (
            <Button type="button" variant="destructive" onClick={doUnpublish} disabled={busy}>
              {busy ? 'Unpublishing…' : 'Unpublish'}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PublishModal;
