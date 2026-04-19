// Experience section form — list-of-entries shape with move/remove/add + markdown bullets.
// WHY index-based ids: entries don't carry their own `id` in the section data payload
// (only the section itself does), so positional index is the natural key for list ops.
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const blank = () => ({
  company: '', role: '', location: '', startDate: '', endDate: '', current: false, bullets: [''],
});

const ExperienceForm = ({ data, onChange }) => {
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
  const addBullet = (i) => replaceAt(i, { bullets: [...entries[i].bullets, ''] });
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
              <Label>Company</Label>
              <Input value={e.company} onChange={(ev) => replaceAt(i, { company: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Role</Label>
              <Input value={e.role} onChange={(ev) => replaceAt(i, { role: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Location</Label>
              <Input value={e.location ?? ''} onChange={(ev) => replaceAt(i, { location: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Dates</Label>
              <div className="flex items-center gap-2">
                <Input type="date" value={e.startDate} onChange={(ev) => replaceAt(i, { startDate: ev.target.value })} />
                <span>–</span>
                <Input type="date" value={e.endDate ?? ''} onChange={(ev) => replaceAt(i, { endDate: ev.target.value })} disabled={e.current} />
              </div>
              <Label className="flex items-center gap-2 font-normal text-muted-foreground">
                <Checkbox
                  checked={e.current}
                  onCheckedChange={(v) => replaceAt(i, { current: Boolean(v), endDate: v ? '' : e.endDate })}
                />
                Current
              </Label>
            </div>
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label className="text-muted-foreground">
              Bullets <span className="text-xs">(markdown — bold/italic/code/links only)</span>
            </Label>
            {e.bullets.map((b, bi) => (
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

export default ExperienceForm;
