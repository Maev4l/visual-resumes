// Languages section form — list of `{ language, proficiency }` entries.
// WHY two plain inputs: proficiency is free-form text (per the schema) so a level
// dropdown would inappropriately constrain what users can say about their fluency.
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import FieldHint from '@/components/editorial/FieldHint';
import { hint } from '../hints';

// Same terse H helper — only render the hint on the first entry so the typographic
// legend appears once per section, not under every repeated row.
const H = ({ children, hintKey, first }) => {
  const h = first ? hint('languages', hintKey) : null;
  return (
    <div className="grid gap-0.5">
      <Label>{children}</Label>
      {h && <FieldHint as={h.as}>{h.text}</FieldHint>}
    </div>
  );
};

const blank = () => ({ language: '', proficiency: '' });

const LanguagesForm = ({ data, onChange }) => {
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
    <div className="grid gap-4">
      {entries.map((e, i) => (
        <div key={i} className="rounded-md border p-3 grid gap-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">Entry #{i + 1}</span>
            <div className="ml-auto flex gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Move up"
                onClick={() => move(i, 'up')} disabled={i === 0}>
                <ArrowUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move down"
                onClick={() => move(i, 'down')} disabled={i === entries.length - 1}>
                <ArrowDown className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove"
                onClick={() => remove(i)} className="text-destructive">
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="grid gap-1">
              <H hintKey="language" first={i === 0}>Language</H>
              <Input value={e.language} onChange={(ev) => replaceAt(i, { language: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <H hintKey="proficiency" first={i === 0}>Proficiency</H>
              <Input
                value={e.proficiency}
                onChange={(ev) => replaceAt(i, { proficiency: ev.target.value })}
                placeholder="Native, Fluent, B2…"
              />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={add}>
        <Plus className="size-4" /> Add entry
      </Button>
    </div>
  );
};

export default LanguagesForm;
