// Summary section form — single free-form textarea.
// WHY minimal: the payload is `{ text }`; any richer structure belongs in a dedicated
// section type rather than this one.
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const SummaryForm = ({ data, onChange }) => (
  <div className="grid gap-1">
    <Label>Summary</Label>
    <Textarea
      rows={5}
      value={data.text ?? ''}
      onChange={(e) => onChange({ ...data, text: e.target.value })}
      placeholder="A concise professional summary…"
    />
  </div>
);

export default SummaryForm;
