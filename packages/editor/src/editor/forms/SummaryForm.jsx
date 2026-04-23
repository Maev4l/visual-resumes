// packages/editor/src/editor/forms/SummaryForm.jsx
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FieldHint from '@/components/editorial/FieldHint';
import { hint } from '../hints';

const SummaryForm = ({ data, onChange }) => {
  const h = hint('summary', 'text');
  return (
    <div className="grid gap-1.5">
      <Label>Text</Label>
      {h && <FieldHint as={h.as}>{h.text}</FieldHint>}
      <Textarea
        rows={4}
        value={data.text ?? ''}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="A short lead paragraph…"
      />
    </div>
  );
};

export default SummaryForm;
