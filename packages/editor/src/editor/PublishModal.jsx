// Publish / unpublish dialog.
// WHY state is local: the parent (`Edit`) owns the resume and passes `onPublished` /
// `onRevoked` so publish status persists in the reducer. This modal just drives the
// API calls and surfaces the shareable URLs; it doesn't need its own store.
import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';

import { api } from '@/api/client';
import { getConfig } from '@/config';
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

  // Published URLs always live under the production host (`publicHost` from the runtime
  // config). Using `window.location.host` would break in dev — a localhost:5178 URL is
  // not shareable. The editor and published artifacts both sit behind the same CloudFront
  // in prod so the URL is the same for the reader.
  const host = getConfig().publicHost;
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
        {/* Editorial chrome: mono kicker + serif title + rule separator. Logic unchanged. */}
        <DialogHeader className="space-y-2">
          <span className="font-meta">
            {result ? 'Published' : 'Ready to publish'}
          </span>
          <DialogTitle className="font-serif text-2xl font-normal text-[var(--color-ink)]">
            {result ? 'Manage publication' : 'Publish this résumé'}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--color-ink-faint)]">
            {result
              ? 'Share the URLs below, or retire the published artifacts from your shelf.'
              : 'Generate a static HTML + PDF at an unguessable URL. Readers need no login.'}
          </DialogDescription>
        </DialogHeader>

        {/* Hair rule below the header — reinforces the typeset-card feel. */}
        <div className="h-px bg-[var(--color-rule)] my-4" aria-hidden="true" />

        {urls && (
          <div className="grid">
            {['html', 'pdf'].map((kind) => (
              // Each URL row: bordered by a soft rule (not a card), mono label + value.
              <div
                key={kind}
                className="flex items-center gap-3 py-2 border-b border-[var(--color-rule-soft)] last:border-0 font-meta"
              >
                <label className="w-12 shrink-0 text-[var(--color-ink-faint)]">{kind}</label>
                <Input
                  readOnly
                  value={urls[kind]}
                  onFocus={(e) => e.target.select()}
                  className="font-mono text-sm flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="font-meta"
                  aria-label="Copy"
                  onClick={() => copy(urls[kind])}
                >
                  <Copy className="size-4" />
                  Copy
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Open" asChild>
                  <a href={urls[kind]} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {!result && (
            <Button
              type="button"
              onClick={doPublish}
              disabled={busy}
              className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]"
            >
              {busy ? 'Publishing…' : 'Publish'}
            </Button>
          )}
          {result && (
            <Button
              type="button"
              variant="ghost"
              onClick={doUnpublish}
              disabled={busy}
              className="text-[var(--color-oxblood)]"
            >
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
