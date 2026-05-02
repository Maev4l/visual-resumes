// packages/editor/src/editor/TemplateModal.jsx
// Enlarged template preview. Two-column body: large live render on the left,
// metadata + CTA on the right. Arrow keys cycle templates without closing so
// the user can compare side-by-side without reopening the modal each time.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TEMPLATES } from '@/templates';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import TemplatePreviewFrame from './TemplatePreviewFrame';

const TemplateModal = ({ templateId, templateIds, onClose, onTemplateChange }) => {
  const navigate = useNavigate();

  // Wraparound cycling so → from the last template lands on the first.
  // Effect is bound to templateId/idx so the closure reads the freshest position.
  useEffect(() => {
    if (templateId == null) return undefined;
    const idx = templateIds.indexOf(templateId);
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        onTemplateChange(templateIds[(idx - 1 + templateIds.length) % templateIds.length]);
      } else if (e.key === 'ArrowRight') {
        onTemplateChange(templateIds[(idx + 1) % templateIds.length]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [templateId, templateIds, onTemplateChange]);

  if (templateId == null) return null;
  const t = TEMPLATES[templateId];
  const idx = templateIds.indexOf(templateId);

  const onUse = () => {
    navigate(`/new?templateId=${templateId}`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl">
        {/* sr-only header keeps Dialog accessible without competing with the
            visible title rendered in the right column. */}
        <DialogHeader className="sr-only">
          <DialogTitle>{t.meta.name} preview</DialogTitle>
          <DialogDescription>{t.meta.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1.4fr_1fr] gap-6">
          <div className="bg-[var(--color-paper-deep)] p-4 grid place-items-center rounded-sm">
            <TemplatePreviewFrame templateId={templateId} size="large" />
          </div>

          <div className="flex flex-col justify-between py-2 min-w-0">
            <div>
              <span className="font-meta inline-flex items-center gap-1.5 text-[var(--color-oxblood)]">
                <span className="inline-block size-1.5 rounded-full bg-[var(--color-oxblood)]" />
                {t.meta.name} · {idx + 1} of {templateIds.length}
              </span>
              <h3 className="font-serif text-3xl font-normal text-[var(--color-ink)] mt-2">
                {t.meta.name}
              </h3>
              <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mt-3">
                {t.meta.description}
              </p>
              <div className="flex flex-wrap gap-2 mt-5 font-meta">
                <span className="border border-[var(--color-rule)] rounded-sm px-2 py-1">
                  {t.meta.supportsPhoto ? 'Photo supported' : 'No photo'}
                </span>
                <span className="border border-[var(--color-rule)] rounded-sm px-2 py-1">
                  A4 / Letter
                </span>
              </div>
            </div>

            <Button
              type="button"
              onClick={onUse}
              className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)] mt-6 self-start"
            >
              Use this template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateModal;
