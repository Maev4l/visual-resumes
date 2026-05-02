// /templates gallery. Editorial chrome (kicker + serif H1 + double rule),
// 1/2/3-column responsive grid of TemplateCards, click-to-enlarge modal.
// Modal state is owned here so arrow-key cycling inside the modal can mutate
// it directly via onTemplateChange.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { TEMPLATES } from '@/templates';
import { Button } from '@/components/ui/button';
import Page from '@/components/editorial/Page';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';
import TemplateCard from '@/editor/TemplateCard';
import TemplateModal from '@/editor/TemplateModal';

const Templates = () => {
  const ids = Object.keys(TEMPLATES);
  const [activeTemplateId, setActiveTemplateId] = useState(null);

  return (
    <Page width="standard">
      {/* WHY a wrapping <div>: Button is `inline-flex`, MetaChip's <span> is also
          inline-level, so without a block-level container they share the same line
          (Button's `mb-6` doesn't push inline siblings to a new row). The div forces
          a block context so the kicker drops below as the editorial layout intends. */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-[var(--color-ink-faint)]"
        >
          <Link to="/"><ArrowLeft className="size-4" /> Shelf</Link>
        </Button>
      </div>

      <MetaChip className="mb-3">Templates</MetaChip>
      <h1 className="font-serif text-4xl font-light text-[var(--color-ink)]">
        Browse the catalogue
      </h1>
      <p className="font-serif italic text-[var(--color-ink-soft)] mt-3">
        Click any card to enlarge. Pick the one you&apos;d like to use for your next résumé.
      </p>
      <RuleLine variant="double" className="mt-6 mb-10" />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ids.map((id) => (
          <TemplateCard
            key={id}
            templateId={id}
            onClick={() => setActiveTemplateId(id)}
          />
        ))}
      </div>

      <TemplateModal
        templateId={activeTemplateId}
        templateIds={ids}
        onClose={() => setActiveTemplateId(null)}
        onTemplateChange={setActiveTemplateId}
      />
    </Page>
  );
};

export default Templates;
