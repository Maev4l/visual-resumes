// Skills section form — list of groups, each group has a label + items.
// WHY comma-separated input: items are stored as string[] but typing a list of tags
// feels heavier than a single text field; we split on save and rejoin on render so the
// underlying model stays array-shaped for the renderer.
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import FieldHint from '@/components/editorial/FieldHint';
import { hint } from '../hints';

// Same terse H helper — only render the hint on the first entry so repeated groups
// don't re-explain the typographic role of each field.
const H = ({ children, hintKey, first }) => {
  const h = first ? hint('skills', hintKey) : null;
  return (
    <div className="grid gap-0.5">
      <Label>{children}</Label>
      {h && <FieldHint as={h.as}>{h.text}</FieldHint>}
    </div>
  );
};

const blank = () => ({ group: '', items: [] });

// Split on commas, trim, drop empties so stray whitespace doesn't pollute the array.
const parseItems = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

const SkillsForm = ({ data, onChange }) => {
  const groups = data ?? [];
  const replaceAt = (i, patch) => onChange(groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const move = (i, dir) => {
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= groups.length) return;
    const next = groups.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i) => onChange(groups.filter((_, idx) => idx !== i));
  const add = () => onChange([...groups, blank()]);

  return (
    <div className="grid gap-4">
      {groups.map((g, i) => (
        <div key={i} className="rounded-md border p-3 grid gap-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">Group #{i + 1}</span>
            <div className="ml-auto flex gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Move up"
                onClick={() => move(i, 'up')} disabled={i === 0}>
                <ArrowUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move down"
                onClick={() => move(i, 'down')} disabled={i === groups.length - 1}>
                <ArrowDown className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove"
                onClick={() => remove(i)} className="text-destructive">
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-1">
            <H hintKey="group" first={i === 0}>Group name</H>
            <Input
              value={g.group ?? ''}
              onChange={(ev) => replaceAt(i, { group: ev.target.value })}
              placeholder="Languages, Tools…"
            />
          </div>
          <div className="grid gap-1">
            <H hintKey="items" first={i === 0}>Items <span className="text-xs text-muted-foreground">(comma-separated)</span></H>
            <Input
              value={(g.items ?? []).join(', ')}
              onChange={(ev) => replaceAt(i, { items: parseItems(ev.target.value) })}
              placeholder="JavaScript, TypeScript, React"
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={add}>
        <Plus className="size-4" /> Add group
      </Button>
    </div>
  );
};

export default SkillsForm;
