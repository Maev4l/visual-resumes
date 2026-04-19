// Read-once-per-access env wrapper. WHY required-or-throw on access: missing env vars
// fail-fast at call time rather than surfacing as opaque runtime errors deep inside an
// S3/CF call.
//
// WHY Proxy (not a frozen object built at module load): tests set `process.env.*` in
// `beforeEach` AFTER the module graph has been imported. An eager object would snapshot
// env at import time and miss those overrides; a Proxy reads on every access so tests
// can mutate env between runs.
const required = new Set(['storageBucket', 'publishedBucket', 'cloudfrontDistId']);
const envNames = {
  storageBucket:    'RESUMES_STORAGE_BUCKET',
  publishedBucket:  'RESUMES_PUBLISHED_BUCKET',
  cloudfrontDistId: 'CLOUDFRONT_DIST_ID',
  // AWS_REGION is injected by Lambda itself; fall back for local node --test runs.
  region:           'AWS_REGION',
};

export const config = new Proxy({}, {
  get(_t, prop) {
    const envName = envNames[prop];
    if (!envName) return undefined;
    const v = process.env[envName];
    if (!v) {
      if (required.has(prop)) throw new Error(`missing required env var: ${envName}`);
      if (prop === 'region') return 'eu-central-1';
    }
    return v;
  },
});
