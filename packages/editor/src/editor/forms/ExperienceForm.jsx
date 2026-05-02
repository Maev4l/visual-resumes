// packages/editor/src/editor/forms/ExperienceForm.jsx
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import FieldHint from '@/components/editorial/FieldHint';
import RuleLine from '@/components/editorial/RuleLine';
import { hint } from '../hints';

const H = ({ children, hintKey, first }) => {
  const h = first ? hint('experience', hintKey) : null;
  return (
    <div className="grid gap-0.5">
      <Label>{children}</Label>
      {h && <FieldHint as={h.as}>{h.text}</FieldHint>}
    </div>
  );
};

const ExperienceForm = ({ data, onChange }) => {
  const list = Array.isArray(data) ? data : [];
  const patch = (i, p) => onChange(list.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  const add = () => onChange([...list, {
    company: '', role: '', location: '', startDate: '', endDate: '', current: false, body: '', pageBreakBefore: false,
  }]);
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };

  return (
    <div className="grid gap-6">
      {list.map((entry, i) => (
        <div key={i} className="grid gap-4">
          {i > 0 && <RuleLine className="my-2" />}
          <div className="flex items-center justify-between">
            <span className="font-meta">Entry {i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Move up"
                onClick={() => move(i, 'up')} disabled={i === 0}><ArrowUp className="size-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move down"
                onClick={() => move(i, 'down')} disabled={i === list.length - 1}><ArrowDown className="size-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove"
                onClick={() => remove(i)} className="text-[var(--color-oxblood)]"><X className="size-4" /></Button>
            </div>
          </div>

          {/* Hidden on entry 1: a break before the first entry overlaps with the
              section-level pageBreakBefore (the heading sits between any preceding
              content and the first entry), so exposing both creates two ways to
              spell the same intent. Same component pattern as SectionList.jsx:58-67. */}
          {i > 0 && (
            <Label className="flex items-center gap-2 font-meta">
              <Checkbox
                checked={entry.pageBreakBefore ?? false}
                onCheckedChange={(v) => patch(i, { pageBreakBefore: Boolean(v) })}
              />
              Page break before
            </Label>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <H hintKey="company" first={i === 0}>Company</H>
              <Input className="mt-auto" value={entry.company ?? ''} onChange={(e) => patch(i, { company: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <H hintKey="role" first={i === 0}>Role</H>
              <Input className="mt-auto" value={entry.role ?? ''} onChange={(e) => patch(i, { role: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <H hintKey="location" first={i === 0}>Location</H>
              <Input className="mt-auto" value={entry.location ?? ''} onChange={(e) => patch(i, { location: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <H hintKey="startDate" first={i === 0}>Start</H>
                <Input className="mt-auto" placeholder="YYYY-MM or YYYY" value={entry.startDate ?? ''} onChange={(e) => patch(i, { startDate: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <H hintKey="endDate" first={i === 0}>End</H>
                <Input className="mt-auto" placeholder="YYYY-MM or YYYY" value={entry.endDate ?? ''} disabled={entry.current}
                  onChange={(e) => patch(i, { endDate: e.target.value })} />
              </div>
            </div>
            <Label className="flex items-center gap-2 text-sm font-normal sm:col-span-2">
              <Checkbox checked={!!entry.current} onCheckedChange={(v) => patch(i, { current: Boolean(v), endDate: v ? '' : entry.endDate })} />
              Currently here
            </Label>
          </div>

          <div className="grid gap-1.5">
            <H hintKey="body" first={i === 0}>Body</H>
            <Textarea
              rows={8}
              value={entry.body ?? ''}
              onChange={(e) => patch(i, { body: e.target.value })}
              className="font-mono text-sm leading-relaxed"
              placeholder={`Freeform markdown. A lead sentence becomes a paragraph; lines starting with "- " become bullets; indent nested bullets with two spaces.

Design the architecture of the IAM and KMS services.
- Create and maintain technical documentation
- Monitor and optimize system performance

Or pure nested bullets:
- Lead security expert for the Analytics org
  - Conduct risk assessments and drive GDPR compliance
  - Trainer for Security Awareness and Secure Programming`}
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

export default ExperienceForm;
