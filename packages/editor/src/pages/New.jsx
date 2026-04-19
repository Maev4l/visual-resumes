// "Create a resume" page — collects the minimum fields needed to POST /resumes, then
// hands off to the Edit page. Template options come straight from the local TEMPLATES
// registry so the choices here always match what the preview renderer can actually render.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

import { api } from '@/api/client';
import { TEMPLATES } from '@/templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const New = () => {
  const navigate = useNavigate();
  const [templateId, setTemplateId] = useState('monaco');
  const [title, setTitle] = useState('');
  const [paperSize, setPaperSize] = useState('A4');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    setBusy(true);
    try {
      const { data } = await api.createResume({ title: title.trim(), templateId, paperSize });
      navigate(`/edit/${data.resume.id}`);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-muted/20">
      <div className="max-w-2xl mx-auto p-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/"><ArrowLeft className="size-4" /> Back</Link>
        </Button>

        <Card>
          <CardHeader><CardTitle>Create a resume</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-6">
              <div className="grid gap-2">
                <Label htmlFor="title">Title (internal only)</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="EN — Senior Engineer"
                />
              </div>

              <div className="grid gap-2">
                <Label>Template</Label>
                {/* Labels wrap each radio so the whole card is a click target. */}
                <RadioGroup value={templateId} onValueChange={setTemplateId} className="grid gap-3">
                  {Object.entries(TEMPLATES).map(([id, t]) => (
                    <Label
                      key={id}
                      htmlFor={`tpl-${id}`}
                      className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${templateId === id ? 'border-primary bg-accent/40' : ''}`}
                    >
                      <RadioGroupItem value={id} id={`tpl-${id}`} />
                      <span className="grid gap-1">
                        <span className="font-medium">{t.meta.name}</span>
                        <span className="text-sm text-muted-foreground">{t.meta.description}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="paper">Paper size</Label>
                <Select value={paperSize} onValueChange={setPaperSize}>
                  <SelectTrigger id="paper"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default New;
