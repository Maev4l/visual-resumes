// Extract caller identity from API Gateway's JWT authorizer context. WHY dedicated class:
// the router needs to distinguish "unauthenticated" (→ 401) from other errors (→ 500).
export class MissingClaimError extends Error {
  constructor(claim) {
    super(`missing required claim: ${claim}`);
    this.name = 'MissingClaimError';
    this.claim = claim;
  }
}

export const extractUser = (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims) throw new MissingClaimError('authorizer.jwt.claims');

  // `custom:Id` is our Cognito custom attribute — a short ID used as the S3 prefix.
  const customId = claims['custom:Id'];
  if (!customId) throw new MissingClaimError('custom:Id');

  return {
    customId,
    sub: claims.sub,
    email: claims.email,
  };
};
