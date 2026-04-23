// Education section form — list-of-entries with move/remove/add.
// Mirrors ExperienceForm's chronological layout + editorial chrome so the author
// sees one consistent pattern per chronological section type.
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import FieldHint from '@/components/editorial/FieldHint';
import RuleLine from '@/components/editorial/RuleLine';
import { hint } from '../hints';

// Terse H helper — only render the hint on the first entry so the form reads as a
// field-role legend, not a repeated caption under every row.
const H = ({ children, hintKey, first }) => {
  const h = first ? hint('education', hintKey) : null;
  return (
    <div className="grid gap-0.5">
      <Label>{children}</Label>
      {h && <FieldHint as={h.as}>{h.text}</FieldHint>}
    </div>
  );
};

const blank = () => ({
  institution: '', degree: '', field: '', startDate: '', endDate: '', notes: '',
});

const EducationForm = ({ data, onChange }) => {
  const entries = data ?? [];
  const replaceAt = (i, patch) => onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const move = (i, dir) => {
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= entries.length) return;
    const next = entries.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i) => onChange(entries.filter((_, idx) => idx !== i));
  const add = () => onChange([...entries, blank()]);

  return (
    <div className="grid gap-6">
      {entries.map((e, i) => (
        <div key={i} className="grid gap-4">
          {i > 0 && <RuleLine className="my-2" />}
          <div className="flex items-center justify-between">
            <span className="font-meta">Entry {i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Move up"
                onClick={() => move(i, 'up')} disabled={i === 0}><ArrowUp className="size-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move down"
                onClick={() => move(i, 'down')} disabled={i === entries.length - 1}><ArrowDown className="size-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove"
                onClick={() => remove(i)} className="text-[var(--color-oxblood)]"><X className="size-4" /></Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <H hintKey="institution" first={i === 0}>Institution</H>
              <Input className="mt-auto" value={e.institution} onChange={(ev) => replaceAt(i, { institution: ev.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <H hintKey="degree" first={i === 0}>Degree</H>
              <Input className="mt-auto" value={e.degree} onChange={(ev) => replaceAt(i, { degree: ev.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <H hintKey="field" first={i === 0}>Field</H>
              <Input className="mt-auto" value={e.field ?? ''} onChange={(ev) => replaceAt(i, { field: ev.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <H hintKey="startDate" first={i === 0}>Start</H>
                <Input className="mt-auto" placeholder="YYYY-MM or YYYY" value={e.startDate ?? ''}
                  onChange={(ev) => replaceAt(i, { startDate: ev.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <H hintKey="endDate" first={i === 0}>End</H>
                <Input className="mt-auto" placeholder="YYYY-MM or YYYY" value={e.endDate ?? ''}
                  onChange={(ev) => replaceAt(i, { endDate: ev.target.value })} />
              </div>
            </div>
          </div>
          <div className="grid gap-1.5">
            <H hintKey="notes" first={i === 0}>Notes</H>
            <Textarea
              rows={2}
              value={e.notes ?? ''}
              onChange={(ev) => replaceAt(i, { notes: ev.target.value })}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="justify-self-start rounded-sm">
        <Plus className="size-4" /> Add entry
      </Button>
    </div>
  );
};

export default EducationForm;
