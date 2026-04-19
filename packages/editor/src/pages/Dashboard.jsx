// Landing page after auth: lists the current user's resumes, plus quick actions to
// create / edit / delete / unpublish. We special-case the 403 response from listResumes
// as "pending approval" because the API rejects users who authenticate but aren't in
// the approved Cognito group — redirecting to /pending avoids a confusing error card.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Plus, ExternalLink, MoreVertical } from 'lucide-react';

import { useAuth } from '@/auth/useAuth';
import { api, ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const Dashboard = () => {
  const { logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // useCallback so the effect below sees a stable reference and we can call load()
  // from the action handlers without triggering re-fetches on every render.
  const load = useCallback(() => {
    api.listResumes()
      .then(({ data }) => setRows(data.resumes))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) navigate('/pending');
        else setError(err.message);
      });
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (id) => {
    // confirm() is intentional: this is a destructive, cross-page action (unpublishes too)
    // and we don't have a reusable confirm-dialog primitive yet.
    if (!confirm('Delete this resume? Also unpublishes it if published.')) return;
    try { await api.deleteResume(id); toast.success('Deleted'); load(); }
    catch (err) { toast.error(`Delete failed: ${err.message}`); }
  };

  const onUnpublish = async (id) => {
    try { await api.revoke(id); toast.success('Unpublished'); load(); }
    catch (err) { toast.error(`Unpublish failed: ${err.message}`); }
  };

  return (
    <main className="min-h-screen bg-muted/20">
      <div className="max-w-5xl mx-auto p-6">
        <header className="flex items-center gap-4 mb-6">
          <h1 className="text-2xl font-semibold flex-1">Your resumes</h1>
          <Button asChild>
            <Link to="/new"><Plus className="size-4" /> Create new</Link>
          </Button>
          <Button variant="ghost" onClick={logout}>Sign out</Button>
        </header>

        {error && <p role="alert" className="text-destructive">Error: {error}</p>}
        {rows === null && !error && <p className="text-muted-foreground">Loading…</p>}
        {rows?.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No resumes yet. Click <strong>Create new</strong>.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          {rows?.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <div className="flex-1">
                  <CardTitle className="text-base">{r.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {r.meta ?? `${r.templateId} · ${r.paperSize} · updated ${dayjs(r.updatedAt).format('YYYY-MM-DD')}`}
                  </p>
                  {r.published && (
                    <p className="text-sm mt-1">
                      <span className="inline-flex items-center gap-1 text-emerald-700">● published</span>
                      {' · '}
                      <a className="underline" href={`/resumes/${r.published.slug}.html`} target="_blank" rel="noreferrer">
                        HTML <ExternalLink className="inline size-3" />
                      </a>
                      {' · '}
                      <a className="underline" href={`/resumes/${r.published.slug}.pdf`} target="_blank" rel="noreferrer">
                        PDF <ExternalLink className="inline size-3" />
                      </a>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/edit/${r.id}`}>Edit</Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Actions">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {r.published && (
                        <DropdownMenuItem onClick={() => onUnpublish(r.id)}>Unpublish</DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(r.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
};

export default Dashboard;
