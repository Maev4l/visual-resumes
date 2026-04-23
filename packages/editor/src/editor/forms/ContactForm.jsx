// packages/editor/src/editor/forms/ContactForm.jsx
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import FieldHint from '@/components/editorial/FieldHint';
import { hint } from '../hints';

// Tiny helper: label + hint in a stable vertical rhythm so the form scans as a table
// of typographic roles rather than a flat field list.
const H = ({ children, hintKey }) => {
  const h = hint('contact', hintKey);
  return (
    <div className="grid gap-0.5">
      <Label>{children}</Label>
      {h && <FieldHint as={h.as}>{h.text}</FieldHint>}
    </div>
  );
};

const ContactForm = ({ data, onChange, photoSlot }) => {
  const patch = (p) => onChange({ ...data, ...p });
  const patchLink = (i, p) => patch({
    links: data.links.map((lnk, idx) => (idx === i ? { ...lnk, ...p } : lnk)),
  });
  const addLink = () => patch({ links: [...data.links, { label: '', url: '' }] });
  const removeLink = (i) => patch({ links: data.links.filter((_, idx) => idx !== i) });

  return (
    <div className="grid gap-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="grid gap-1.5">
          <H hintKey="name">Name</H>
          <Input value={data.name ?? ''} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <H hintKey="headline">Headline</H>
          <Input
            value={data.headline ?? ''}
            onChange={(e) => patch({ headline: e.target.value })}
            placeholder="Senior Engineer"
          />
        </div>
        <div className="grid gap-1.5">
          <H hintKey="email">Email</H>
          <Input type="email" value={data.email ?? ''} onChange={(e) => patch({ email: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <H hintKey="phone">Phone</H>
          <Input value={data.phone ?? ''} onChange={(e) => patch({ phone: e.target.value })} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <H hintKey="location">Location</H>
          <Input value={data.location ?? ''} onChange={(e) => patch({ location: e.target.value })} />
        </div>
      </div>

      {photoSlot}

      <div className="grid gap-2">
        <Label>Links</Label>
        {(data.links ?? []).map((lnk, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <div className="grid gap-1">
              <Input
                placeholder="label"
                value={lnk.label}
                onChange={(e) => patchLink(i, { label: e.target.value })}
              />
              {i === 0 && <FieldHint as={hint('contact', 'linkLabel').as}>{hint('contact', 'linkLabel').text}</FieldHint>}
            </div>
            <div className="grid gap-1">
              <Input
                placeholder="https://…"
                value={lnk.url}
                onChange={(e) => patchLink(i, { url: e.target.value })}
              />
              {i === 0 && <FieldHint as={hint('contact', 'linkUrl').as}>{hint('contact', 'linkUrl').text}</FieldHint>}
            </div>
            <Button type="button" variant="ghost" size="icon"
              onClick={() => removeLink(i)} aria-label="Remove">
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addLink} className="justify-self-start rounded-sm">
          Add link
        </Button>
      </div>
    </div>
  );
};

export default ContactForm;
