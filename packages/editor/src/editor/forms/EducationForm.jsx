// Education section form — list-of-entries with move/remove/add.
// WHY same layout as ExperienceForm: both share the chronological-entry shape; keeping
// the UI consistent lowers the learning curve when authoring a multi-entry resume.
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

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
              <Label>Institution</Label>
              <Input value={e.institution} onChange={(ev) => replaceAt(i, { institution: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Degree</Label>
              <Input value={e.degree} onChange={(ev) => replaceAt(i, { degree: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Field</Label>
              <Input value={e.field ?? ''} onChange={(ev) => replaceAt(i, { field: ev.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>Dates</Label>
              <div className="flex items-center gap-2">
                <Input type="date" value={e.startDate} onChange={(ev) => replaceAt(i, { startDate: ev.target.value })} />
                <span>–</span>
                <Input type="date" value={e.endDate ?? ''} onChange={(ev) => replaceAt(i, { endDate: ev.target.value })} />
              </div>
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={e.notes ?? ''}
              onChange={(ev) => replaceAt(i, { notes: ev.target.value })}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={add}>
        <Plus className="size-4" /> Add entry
      </Button>
    </div>
  );
};

export default EducationForm;
