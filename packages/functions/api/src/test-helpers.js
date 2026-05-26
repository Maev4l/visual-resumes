// Shared helpers for route tests — file name is NOT *.test.js so node --test ignores it.
import { app } from './app.js';

// Builds a request with the x-amzn-request-context header LWA forwards from API Gateway.
// Includes the JWT claims block that requireUser middleware expects.
export const callWithUser = (path, init = {}, customId = 'U1') => {
  const requestContext = JSON.stringify({
    authorizer: { jwt: { claims: { 'custom:Id': customId } } },
  });
  return app.request(path, {
    ...init,
    headers: {
      'x-amzn-request-context': requestContext,
      ...init.headers,
    },
  });
};

// Calls the app with no x-amzn-request-context header — useful for asserting 401 on missing claims.
export const callAnon = (path, init = {}) => app.request(path, init);
