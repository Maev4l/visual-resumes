// packages/editor/src/editor/TemplateCard.jsx
// One thumbnail card on the /templates gallery. The whole card is the click
// target — no inline "Use this template" button, because the modal owns that
// CTA. Keeps cards calm and uniform in the grid.
import { TEMPLATES } from '@/templates';
import PaperCard from '@/components/editorial/PaperCard';
import MetaChip from '@/components/editorial/MetaChip';
import TemplatePreviewFrame from './TemplatePreviewFrame';

const TemplateCard = ({ templateId, onClick }) => {
  const t = TEMPLATES[templateId];
  return (
    <PaperCard
      as="button"
      type="button"
      interactive
      onClick={onClick}
      className="p-5 text-left grid gap-3"
    >
      {/* Paper-deep mat behind the preview keeps the white A4 visually distinct
          from the paper-coloured card surface. */}
      <div className="grid place-items-center bg-[var(--color-paper-deep)] p-3 rounded-sm">
        <TemplatePreviewFrame templateId={templateId} size="thumb" />
      </div>
      <MetaChip>{t.meta.supportsPhoto ? 'Photo' : 'No photo'}</MetaChip>
      <h3 className="font-serif text-2xl font-normal text-[var(--color-ink)]">
        {t.meta.name}
      </h3>
      <p className="text-sm leading-relaxed text-[var(--color-ink-faint)]">
        {t.meta.description}
      </p>
    </PaperCard>
  );
};

export default TemplateCard;
