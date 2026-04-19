// Thin wrapper around Amplify.configure(). We keep it isolated so the rest of
// the app doesn't depend on Amplify's specific Auth.Cognito config shape and
// can be swapped out (or mocked in tests) without ceremony.
import { Amplify } from 'aws-amplify';

// Localhost dev URL — matches the Vite `server.port` in vite.config.js and the
// localhost entry in Cognito's `callback_urls` / `logout_urls` (platform/idp).
// Listed alongside the prod URL; Amplify picks the one matching the current origin
// and rejects the other as non-matching (InvalidOriginException otherwise).
const LOCALHOST_URL = 'http://localhost:5178/';

export const configureAmplify = (config) => {
  // Amplify expects `domain` as a bare host — strip any protocol prefix so the
  // Terraform output (which includes `https://`) works unchanged.
  const domain = config.cognitoHostedUiOrigin.replace(/^https?:\/\//, '');
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId,
        userPoolClientId: config.cognitoClientId,
        loginWith: {
          oauth: {
            domain,
            scopes: config.cognitoScopes,
            redirectSignIn:  [config.cognitoRedirectUri, LOCALHOST_URL],
            redirectSignOut: [config.cognitoLogoutUri,   LOCALHOST_URL],
            responseType: 'code',
          },
        },
      },
    },
  });
};
