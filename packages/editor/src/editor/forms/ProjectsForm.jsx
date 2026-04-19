// Projects section form — list of project entries with tech (tags) + markdown bullets.
// WHY parallel structure to ExperienceForm: both are list-of-entries with bullets; we
// keep the move/add/remove affordances consistent so users don't relearn the UI per
// section type.
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const blank = () => ({ name: '', description: '', link: '', tech: [], bullets: [''] });
const parseTech = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

const ProjectsForm = ({ data, onChange }) => {
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

  const setBullet = (i, bi, v) => replaceAt(i, {
    bullets: entries[i].bullets.map((b, idx) => (idx === bi ? v : b)),
  });
  const addBullet = (i) => replaceAt(i, { bullets: [...(entries[i].bullets ?? []), ''] });
  const rmBullet = (i, bi) => replaceAt(i, {
    bullets: entries[i].bullets.filter((_, idx) => idx !== bi),
  });

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
              <Label>Name</Label>
              <Input value={e.name} onChange={(ev) => replaceAt(i, { name: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Link</Label>
              <Input value={e.link ?? ''} onChange={(ev) => replaceAt(i, { link: ev.target.value })} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={e.description ?? ''}
              onChange={(ev) => replaceAt(i, { description: ev.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label>Tech <span className="text-xs text-muted-foreground">(comma-separated)</span></Label>
            <Input
              value={(e.tech ?? []).join(', ')}
              onChange={(ev) => replaceAt(i, { tech: parseTech(ev.target.value) })}
              placeholder="React, Node, Postgres"
            />
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label className="text-muted-foreground">
              Bullets <span className="text-xs">(markdown — bold/italic/code/links only)</span>
            </Label>
            {(e.bullets ?? []).map((b, bi) => (
              <div key={bi} className="flex gap-2">
                <Input value={b} onChange={(ev) => setBullet(i, bi, ev.target.value)} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove bullet"
                  onClick={() => rmBullet(i, bi)}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => addBullet(i)}>
              <Plus className="size-4" /> Add bullet
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={add}>
        <Plus className="size-4" /> Add entry
      </Button>
    </div>
  );
};

export default ProjectsForm;
