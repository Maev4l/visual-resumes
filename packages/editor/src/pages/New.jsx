// packages/editor/src/pages/New.jsx
// Template picker. Each template is a PaperCard in a grid; the active one gets an
// ink border and the oxblood "Selected" chip. Inputs sit on the canvas without
// shadcn Card chrome.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

import { api } from '@/api/client';
import { TEMPLATES } from '@/templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Page from '@/components/editorial/Page';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';
import PaperCard from '@/components/editorial/PaperCard';

const New = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Honour the gallery's "Use this template" hand-off. Falls back to monaco if
  // the param is absent or names a template we no longer ship.
  const requested = searchParams.get('templateId');
  const initialTemplateId = requested && TEMPLATES[requested] ? requested : 'monaco';
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [title, setTitle] = useState('');
  const [paperSize, setPaperSize] = useState('A4');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    setBusy(true);
    try {
      const { data } = await api.createResume({ title: title.trim(), templateId, paperSize });
      navigate(`/edit/${data.resume.id}`);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Page width="standard">
      {/* WHY a wrapping <div>: Button is `inline-flex`, MetaChip's <span> is also
          inline-level, so without a block-level container they share the same line
          (Button's `mb-6` doesn't push inline siblings to a new row). */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-[var(--color-ink-faint)]">
          <Link to="/"><ArrowLeft className="size-4" /> Shelf</Link>
        </Button>
      </div>

      <MetaChip className="mb-3">New document</MetaChip>
      <h1 className="font-serif text-4xl font-light text-[var(--color-ink)]">
        Compose a new résumé
      </h1>
      <RuleLine variant="double" className="mt-6 mb-10" />

      <form onSubmit={onSubmit} className="grid gap-10">
        <section className="grid gap-3">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="title" className="font-serif text-lg font-normal text-[var(--color-ink)]">
              Title
            </Label>
            <MetaChip>Internal only</MetaChip>
          </div>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="EN · Senior Engineer"
            className="rounded-sm bg-[var(--color-paper)] border-[var(--color-rule)] focus-visible:border-[var(--color-ink)] font-serif text-xl h-12"
          />
          <span className="font-meta">Not shown publicly. Used to tell versions apart on your shelf.</span>
        </section>

        <section className="grid gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg font-normal text-[var(--color-ink)]">Template</h2>
            <MetaChip>{Object.keys(TEMPLATES).length} available</MetaChip>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(TEMPLATES).map(([id, t]) => {
              const active = templateId === id;
              return (
                <PaperCard
                  as="button"
                  key={id}
                  type="button"
                  interactive
                  active={active}
                  onClick={() => setTemplateId(id)}
                  className="p-5 text-left"
                >
                  <MetaChip tone={active ? 'live' : 'muted'}>
                    {active ? 'Selected' : t.meta.supportsPhoto ? 'Photo' : 'No photo'}
                  </MetaChip>
                  <h3 className="mt-3 font-serif text-2xl font-normal text-[var(--color-ink)]">
                    {t.meta.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-faint)]">
                    {t.meta.description}
                  </p>
                </PaperCard>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3">
          <Label className="font-serif text-lg font-normal text-[var(--color-ink)]">Paper size</Label>
          <Select value={paperSize} onValueChange={setPaperSize}>
            <SelectTrigger className="w-40 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="Letter">Letter</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <RuleLine />

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" asChild className="text-[var(--color-ink-faint)]">
            <Link to="/">Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]"
          >
            {busy ? 'Composing…' : 'Begin composition'}
          </Button>
        </div>
      </form>
    </Page>
  );
};

export default New;
