// React auth context built on Amplify v6's Hub. Amplify owns token storage and
// refresh; we subscribe so the UI reflects state changes (post-redirect login,
// silent refresh, explicit signOut) without polling.
import { createContext, useEffect, useMemo, useState } from 'react';
import { Hub } from 'aws-amplify/utils';
import { fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth';
import { loadConfig } from '../config.js';
import { configureAmplify } from './amplify.js';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [configured, setConfigured] = useState(false);
  // `loading` keeps us from flashing "sign-in" while Amplify still has a
  // refreshable session sitting in storage.
  const [status, setStatus] = useState('loading'); // loading | authed | anonymous
  const [idToken, setIdToken] = useState(null);

  // Load /config.json then configure Amplify once. We intentionally don't hide
  // the error — if config is missing we flip to anonymous so RequireAuth will
  // kick a redirect loop only after the user lands on a guarded route.
  useEffect(() => {
    loadConfig()
      .then((c) => {
        configureAmplify(c);
        setConfigured(true);
      })
      .catch((err) => {
        console.error('config/Amplify configure failed', err);
        setStatus('anonymous');
      });
  }, []);

  // Pulls the current session from Amplify's token store. Safe to call anytime;
  // Amplify handles the refresh dance when the access token is stale.
  const refresh = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (token) { setIdToken(token); setStatus('authed'); }
      else       { setIdToken(null);  setStatus('anonymous'); }
    } catch {
      setIdToken(null); setStatus('anonymous');
    }
  };

  // Kick off refresh + subscribe to auth events. We listen for the post-redirect
  // events so the Callback page doesn't need to manually poke the context.
  useEffect(() => {
    if (!configured) return;
    refresh();
    const unsub = Hub.listen('auth', ({ payload }) => {
      if (['signedIn', 'signInWithRedirect', 'tokenRefresh'].includes(payload.event)) refresh();
      if (payload.event === 'signedOut') { setIdToken(null); setStatus('anonymous'); }
    });
    return unsub;
  }, [configured]);

  const value = useMemo(() => ({
    status,
    idToken,
    isAuthenticated: status === 'authed',
    // Pass provider: 'Google' so Hosted UI skips the "choose provider" gate and
    // sends the user straight to Google's consent screen.
    login:  () => signInWithRedirect({ provider: 'Google' }),
    logout: () => signOut(),
    refresh,
  }), [status, idToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
