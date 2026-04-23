// packages/editor/src/pages/Dashboard.jsx
// Landing page after auth. Resumes are presented as a "shelf" of paper cards:
// serif title, metadata margin notes in small-caps mono, oxblood dot + mono label
// for published status. Actions live in a ghost dropdown so the card stays calm.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Plus, ExternalLink, MoreVertical } from 'lucide-react';

import { useAuth } from '@/auth/useAuth';
import { api, ApiError } from '@/api/client';
import { getConfig } from '@/config';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Page from '@/components/editorial/Page';
import Wordmark from '@/components/editorial/Wordmark';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';
import PaperCard from '@/components/editorial/PaperCard';

const Dashboard = () => {
  const { logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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
    if (!confirm('Delete this resume? Also unpublishes it if published.')) return;
    try { await api.deleteResume(id); toast.success('Deleted'); load(); }
    catch (err) { toast.error(`Delete failed: ${err.message}`); }
  };

  const onUnpublish = async (id) => {
    try { await api.revoke(id); toast.success('Unpublished'); load(); }
    catch (err) { toast.error(`Unpublish failed: ${err.message}`); }
  };

  const onPublish = async (id) => {
    try {
      const { data } = await api.publish(id);
      const url = `https://${getConfig().publicHost}/resumes/${data.slug}.html`;
      toast.success('Published', {
        description: url,
        action: { label: 'Copy', onClick: () => navigator.clipboard.writeText(url) },
      });
      load();
    } catch (err) {
      toast.error(`Publish failed: ${err.message}`);
    }
  };

  return (
    <Page width="standard">
      <header className="flex items-end gap-6 mb-8">
        <Wordmark size="md" />
        <div className="ml-auto flex items-center gap-3">
          <Button asChild className="rounded-sm bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-[var(--color-paper)]">
            <Link to="/new"><Plus className="size-4" /> New resume</Link>
          </Button>
          <Button variant="ghost" onClick={logout} className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
            Sign out
          </Button>
        </div>
      </header>

      <RuleLine variant="double" className="mb-8" />

      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-serif text-2xl font-normal text-[var(--color-ink)]">Your shelf</h2>
        <MetaChip>
          {rows ? `${rows.length} document${rows.length === 1 ? '' : 's'}` : '—'}
        </MetaChip>
      </div>

      {error && (
        <p role="alert" className="font-meta text-[var(--color-oxblood)]">Error · {error}</p>
      )}
      {rows === null && !error && (
        <p className="font-meta">Loading…</p>
      )}
      {rows?.length === 0 && (
        <PaperCard className="p-10 text-center">
          <p className="font-serif italic text-lg text-[var(--color-ink-faint)]">Your shelf is empty.</p>
          <p className="mt-2 text-sm text-[var(--color-ink-faint)]">
            Start with <Link to="/new" className="underline decoration-[var(--color-oxblood)] decoration-2 underline-offset-4 text-[var(--color-ink)]">New resume</Link>.
          </p>
        </PaperCard>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {rows?.map((r) => (
          <PaperCard key={r.id} interactive className="p-5 flex flex-col">
            <div className="flex items-start gap-2 mb-3">
              <MetaChip tone={r.published ? 'live' : 'muted'} className="flex-1">
                {r.published ? 'Published' : 'Draft'}
                <span className="mx-1 opacity-60">·</span>
                {r.templateId}
                <span className="mx-1 opacity-60">·</span>
                {r.paperSize}
              </MetaChip>
              <DropdownMenu>
                {/* Plain <button> (not shadcn's <Button>) so we bypass the Slot + asChild
                    interaction — some shadcn/Radix version combos fail to forward click
                    events through the Slot wrapper. */}
                <DropdownMenuTrigger
                  aria-label="Actions"
                  className="-m-2 size-8 inline-flex items-center justify-center rounded-sm text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ink)]"
                >
                  <MoreVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {r.published
                    ? <DropdownMenuItem onClick={() => onUnpublish(r.id)}>Unpublish</DropdownMenuItem>
                    : <DropdownMenuItem onClick={() => onPublish(r.id)}>Publish</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-[var(--color-oxblood)] focus:text-[var(--color-oxblood)]"
                    onClick={() => onDelete(r.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Link to={`/edit/${r.id}`} className="group block flex-1">
              <h3 className="font-serif text-xl font-normal leading-tight text-[var(--color-ink)] group-hover:text-[var(--color-oxblood)] transition-colors">
                {r.title || <span className="italic text-[var(--color-ink-faint)]">Untitled</span>}
              </h3>
              <p className="mt-3 font-meta">
                Updated {dayjs(r.updatedAt).format('D MMM YYYY')}
              </p>
            </Link>

            {r.published && (
              <div className="mt-4 pt-3 border-t border-[var(--color-rule-soft)] flex gap-3 font-meta">
                {/* Absolute URL against the production host so dev links go to the real
                    published page rather than resolving against `localhost:5178`. */}
                <a href={`https://${getConfig().publicHost}/resumes/${r.published.slug}.html`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 hover:text-[var(--color-ink)]">
                  HTML <ExternalLink className="size-3" />
                </a>
                <a href={`https://${getConfig().publicHost}/resumes/${r.published.slug}.pdf`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 hover:text-[var(--color-ink)]">
                  PDF <ExternalLink className="size-3" />
                </a>
              </div>
            )}
          </PaperCard>
        ))}
      </div>
    </Page>
  );
};

export default Dashboard;
