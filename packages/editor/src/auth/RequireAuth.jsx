// Route guard. Sends unauthenticated users to /login (a visible "Continue with Google"
// page) rather than auto-firing signInWithRedirect from here — the explicit gesture
// surfaces config/OAuth failures as a visible button instead of a stalled blank screen.
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth.js';

const RequireAuth = ({ children }) => {
  const { status } = useAuth();

  if (status === 'loading') {
    return <main className="min-h-screen grid place-items-center"><p className="text-muted-foreground">Loading…</p></main>;
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  return children;
};

export default RequireAuth;
