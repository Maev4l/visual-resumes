// packages/editor/src/editor/SectionList.jsx
// Sections rendered as rule-separated editorial blocks instead of shadcn cards.
// The per-section title is Fraunces; move/remove controls live in a subtle right
// rail. Body content sits on the canvas — no inner borders — so the form reads as
// one long composition rather than a stack of boxes.
import { useState } from 'react';
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { SECTION_TYPES, sectionTitle } from '@shared/section-types.js';
import { FORMS } from './forms';
import { actions } from './reducer';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';

const SectionList = ({ state, dispatch, photoSlot }) => {
  const [newType, setNewType] = useState('');
  // Section types can only appear once — each already owns a list internally (entries
  // for Experience, groups for Skills, etc.), and single-object sections (Contact,
  // Summary) are conceptually singular. Hide the used ones from the "Add" picker.
  const usedTypes = new Set(state.resume.sections.map((s) => s.type));
  const availableTypes = SECTION_TYPES.filter((t) => !usedTypes.has(t.id));
  const allUsed = availableTypes.length === 0;

  return (
    <div className="grid gap-10">
      {state.resume.sections.map((section, i) => {
        const Form = FORMS[section.type];
        if (!Form) {
          return (
            <p key={section.id} className="font-meta text-[var(--color-oxblood)]">
              Unknown section type · {section.type}
            </p>
          );
        }
        const isLast = i === state.resume.sections.length - 1;
        return (
          <article key={section.id} className="grid gap-5">
            <header className="flex items-start gap-4">
              <div className="flex-1 grid gap-2">
                <MetaChip>Section {i + 1} · {section.type}</MetaChip>
                <h2 className="font-serif text-2xl font-normal text-[var(--color-ink)]">
                  {sectionTitle(section)}
                </h2>
                <Input
                  className="h-8 text-sm max-w-sm rounded-sm border-[var(--color-rule-soft)]"
                  placeholder="override title"
                  value={section.customTitle ?? ''}
                  onChange={(e) => dispatch(actions.updateSection({
                    id: section.id,
                    patch: { customTitle: e.target.value || undefined },
                  }))}
                />
                <Label className="flex items-center gap-2 font-meta">
                  <Checkbox
                    checked={section.pageBreakBefore ?? false}
                    onCheckedChange={(v) => dispatch(actions.updateSection({
                      id: section.id,
                      patch: { pageBreakBefore: Boolean(v) },
                    }))}
                  />
                  Page break before
                </Label>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label="Move up"
                  onClick={() => dispatch(actions.moveSection({ id: section.id, direction: 'up' }))}
                  disabled={i === 0}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Move down"
                  onClick={() => dispatch(actions.moveSection({ id: section.id, direction: 'down' }))}
                  disabled={isLast}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove"
                  onClick={() => dispatch(actions.removeSection({ id: section.id }))}
                  className="text-[var(--color-oxblood)]">
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            <div className="pl-0 sm:pl-1">
              <Form
                data={section.data}
                onChange={(data) => dispatch(actions.updateSectionData({ id: section.id, data }))}
                photoSlot={section.type === 'contact' ? photoSlot : null}
              />
            </div>

            {!isLast && <RuleLine className="mt-4" />}
          </article>
        );
      })}

      <div className="grid gap-3 pt-6 border-t border-[var(--color-rule)]">
        <MetaChip>Add a section</MetaChip>
        {allUsed ? (
          <p className="font-serif italic text-[var(--color-ink-faint)]">
            Every section type is already in the composition. Remove one first to add another.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="w-64 rounded-sm"><SelectValue placeholder="Choose a type…" /></SelectTrigger>
              <SelectContent>
                {availableTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.defaultTitle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => {
                if (newType) {
                  dispatch(actions.addSection({ type: newType }));
                  setNewType('');
                }
              }}
              disabled={!newType}
              className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]"
            >
              <Plus className="size-4" /> Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SectionList;
