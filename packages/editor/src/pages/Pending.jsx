// Shown after sign-in if the user is authenticated but not yet in the approved Cognito group.
// WHY a dedicated page: the Hosted-UI redirect will succeed for any valid pool user, so the
// group-gated 403 from the API is the earliest signal we have that the account needs manual
// approval — better to surface that calmly than to let the Dashboard show an error card.
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import Page from '@/components/editorial/Page';
import Wordmark from '@/components/editorial/Wordmark';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';

const Pending = () => {
  const { logout } = useAuth();
  return (
    <Page width="reading">
      <Wordmark size="md" />
      <RuleLine variant="double" className="mt-6 mb-8" />

      <MetaChip className="mb-3">Pending approval</MetaChip>
      <h2 className="font-serif text-3xl font-light text-[var(--color-ink)]">
        Your account is awaiting review.
      </h2>
      <p className="mt-4 font-serif italic text-[var(--color-ink-soft)]">
        The administrator has been notified by email. Once approved, this page will
        let you through to your shelf on next sign-in.
      </p>

      <div className="mt-10">
        <Button variant="outline" onClick={logout} className="rounded-sm">
          Sign out
        </Button>
      </div>
    </Page>
  );
};

export default Pending;
