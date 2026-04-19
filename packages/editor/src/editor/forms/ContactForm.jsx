// Contact section form.
// WHY object-shape patch: contact data is a single object (not a list), so we merge
// partial updates into the existing object rather than the list-of-entries pattern
// used by Experience/Education/etc.
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const ContactForm = ({ data, onChange, photoSlot }) => {
  const patch = (p) => onChange({ ...data, ...p });
  // Link list helpers: index-based since links have no stable id in the payload shape.
  const patchLink = (i, p) => patch({
    links: data.links.map((lnk, idx) => (idx === i ? { ...lnk, ...p } : lnk)),
  });
  const addLink = () => patch({ links: [...data.links, { label: '', url: '' }] });
  const removeLink = (i) => patch({ links: data.links.filter((_, idx) => idx !== i) });

  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label>Name</Label>
          <Input value={data.name ?? ''} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label>Headline</Label>
          <Input
            value={data.headline ?? ''}
            onChange={(e) => patch({ headline: e.target.value })}
            placeholder="Senior Engineer"
          />
        </div>
        <div className="grid gap-1">
          <Label>Email</Label>
          <Input type="email" value={data.email ?? ''} onChange={(e) => patch({ email: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label>Phone</Label>
          <Input value={data.phone ?? ''} onChange={(e) => patch({ phone: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label>Location</Label>
          <Input value={data.location ?? ''} onChange={(e) => patch({ location: e.target.value })} />
        </div>
      </div>

      {photoSlot}

      <div className="grid gap-2">
        <Label>Links</Label>
        {(data.links ?? []).map((lnk, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="label"
              value={lnk.label}
              onChange={(e) => patchLink(i, { label: e.target.value })}
            />
            <Input
              placeholder="https://…"
              value={lnk.url}
              onChange={(e) => patchLink(i, { url: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeLink(i)}
              aria-label="Remove"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addLink}>Add link</Button>
      </div>
    </div>
  );
};

export default ContactForm;
