// Generic 404 fallback for the SPA. Intentionally unauthenticated so stale bookmarks
// don't bounce users through the Hosted-UI redirect loop before showing an error.
import { Link } from 'react-router-dom';
import Page from '@/components/editorial/Page';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';

const NotFound = () => (
  <Page width="reading">
    <MetaChip className="mb-3">404 · Not found</MetaChip>
    <h1 className="font-serif text-5xl font-light text-[var(--color-ink)]">
      No such page in the catalog.
    </h1>
    <RuleLine variant="double" className="mt-6 mb-6" />
    <p className="font-serif italic text-[var(--color-ink-soft)]">
      The URL you followed doesn&apos;t correspond to anything on this site.
    </p>
    <Link
      to="/"
      className="mt-8 inline-block font-meta text-[var(--color-ink)] underline decoration-[var(--color-oxblood)] decoration-2 underline-offset-4"
    >
      Return to the shelf
    </Link>
  </Page>
);

export default NotFound;
