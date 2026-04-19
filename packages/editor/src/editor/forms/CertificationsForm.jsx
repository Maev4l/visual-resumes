// Certifications section form — list of `{ name, issuer, date, link? }` entries.
// WHY `type="date"` on `date`: matches the schema's `format: date` constraint and avoids
// a free-text field where users mis-format month abbreviations.
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const blank = () => ({ name: '', issuer: '', date: '', link: '' });

const CertificationsForm = ({ data, onChange }) => {
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
              <Label>Name</Label>
              <Input value={e.name} onChange={(ev) => replaceAt(i, { name: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Issuer</Label>
              <Input value={e.issuer} onChange={(ev) => replaceAt(i, { issuer: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Date</Label>
              <Input type="date" value={e.date} onChange={(ev) => replaceAt(i, { date: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Link</Label>
              <Input value={e.link ?? ''} onChange={(ev) => replaceAt(i, { link: ev.target.value })} />
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

export default CertificationsForm;
