// packages/editor/src/pages/Login.jsx
// Editorial front door. Left: huge wordmark + tagline as the hero. Right: a small,
// restrained Google button card. Background: cream with a faint diagonal rule pattern
// so the canvas has texture without competing with the type.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hub } from 'aws-amplify/utils';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import Wordmark from '@/components/editorial/Wordmark';
import RuleLine from '@/components/editorial/RuleLine';
import MetaChip from '@/components/editorial/MetaChip';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const Login = () => {
  const { status, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'authed') navigate('/', { replace: true });
  }, [status, navigate]);

  useEffect(() => Hub.listen('auth', ({ payload }) => {
    if (payload.event === 'signInWithRedirect_failure') {
      console.error('signInWithRedirect failed', payload.data);
    }
  }), []);

  return (
    <main
      className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink-soft)] relative overflow-hidden"
      // Diagonal hairline pattern — subtle paper texture without competing with type.
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, transparent 0 24px, rgba(26,24,20,0.015) 24px 25px)',
      }}
    >
      <div className="relative min-h-screen grid grid-rows-[auto_1fr_auto] lg:grid-rows-1 lg:grid-cols-[7fr_5fr]">
        {/* Left hero — canvas column */}
        <section className="flex flex-col justify-end p-8 sm:p-12 lg:p-16 lg:pr-20 lg:border-r border-[var(--color-rule)] min-h-[60vh] lg:min-h-screen">
          <MetaChip className="mb-6">Vol. II · Est. MMXXVI</MetaChip>
          <Wordmark size="xl" />
          <p className="mt-8 max-w-[32ch] text-lg sm:text-xl font-serif italic text-[var(--color-ink-soft)] leading-snug">
            A small, considered tool for authoring curricula vitæ worth reading.
          </p>
          <RuleLine variant="double" className="mt-10 max-w-[24ch]" />
          <p className="mt-6 max-w-[38ch] text-sm text-[var(--color-ink-faint)] leading-relaxed">
            Pick a template, compose your sections in a form, and publish to a static URL
            your readers will never see behind a login.
          </p>
        </section>

        {/* Right — sign-in panel */}
        <section className="flex flex-col justify-center p-8 sm:p-12 lg:p-16 bg-[var(--color-paper-deep)]/40">
          <MetaChip tone="ink" className="mb-4">Sign in</MetaChip>
          <h2 className="font-serif text-3xl font-light leading-tight text-[var(--color-ink)]">
            Continue with Google
          </h2>
          <p className="mt-3 text-sm text-[var(--color-ink-faint)] leading-relaxed max-w-[40ch]">
            Authoring requires a Google account. New accounts land in a pending state until
            the administrator approves access.
          </p>

          <Button
            variant="outline"
            className="mt-8 w-full h-12 gap-3 border-[var(--color-ink)] bg-[var(--color-paper)] hover:bg-[var(--color-paper-deep)] text-[var(--color-ink)] rounded-sm"
            onClick={() => login()}
            disabled={status === 'loading'}
          >
            <GoogleIcon />
            <span className="font-medium tracking-tight">Continue with Google</span>
          </Button>

          <p className="mt-8 font-meta">
            Closed beta · ~5 authors
          </p>
        </section>
      </div>
    </main>
  );
};

export default Login;
