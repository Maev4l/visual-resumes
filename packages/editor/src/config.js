// Runtime config is NOT baked into the Vite bundle — the deploy script writes
// /config.json to the editor bucket from Terraform outputs, and the SPA fetches
// it on boot. This keeps Cognito IDs / API URLs / region values out of the build
// and makes the same bundle reusable across environments.
//
// For local dev: drop a matching file at `public/config.json` (gitignored).

let cached = null;

export const loadConfig = async () => {
  if (cached) return cached;
  const res = await fetch('/config.json', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      `/config.json missing (HTTP ${res.status}). ` +
      `Dev: copy one with \`terraform -chdir=packages/infrastructure output -raw editor_runtime_config > packages/editor/public/config.json\`.`,
    );
  }
  cached = await res.json();
  return cached;
};

export const getConfig = () => {
  if (!cached) throw new Error('config not loaded; call loadConfig() first');
  return cached;
};
