// Top-level section list: renders each section as a Card with the matching form body
// plus per-section controls (title override, page break, move/remove).
// WHY split from Edit.jsx: the main page owns save/preview/header; the list owns the
// add-section flow and per-section editing plumbing. Keeping these apart lets each
// piece stay under ~150 lines without sprouting prop-drilling hacks.
import { useState } from 'react';
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react';
import { SECTION_TYPES, sectionTitle } from '@shared/section-types.js';
import { FORMS } from './forms';
import { actions } from './reducer';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SectionList = ({ state, dispatch, photoSlot }) => {
  const [newType, setNewType] = useState('');

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Select value={newType} onValueChange={setNewType}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Add section…" /></SelectTrigger>
          <SelectContent>
            {SECTION_TYPES.map((t) => (
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
        >
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {state.resume.sections.map((section, i) => {
        const Form = FORMS[section.type];
        if (!Form) {
          return (
            <p key={section.id} className="text-destructive">
              Unknown section type: {section.type}
            </p>
          );
        }
        const isLast = i === state.resume.sections.length - 1;
        return (
          <Card key={section.id}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex-1 grid gap-1">
                <h3 className="font-semibold">{sectionTitle(section)}</h3>
                <Input
                  className="h-8 text-sm"
                  placeholder="override title"
                  value={section.customTitle ?? ''}
                  onChange={(e) => dispatch(actions.updateSection({
                    id: section.id,
                    // WHY `undefined` when empty: keeps JSON clean — the renderer falls
                    // back to the default title only when `customTitle` is absent.
                    patch: { customTitle: e.target.value || undefined },
                  }))}
                />
                <Label className="flex items-center gap-2 font-normal text-muted-foreground text-xs">
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
                  className="text-destructive">
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Form
                data={section.data}
                onChange={(data) => dispatch(actions.updateSectionData({ id: section.id, data }))}
                photoSlot={section.type === 'contact' ? photoSlot : null}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default SectionList;
