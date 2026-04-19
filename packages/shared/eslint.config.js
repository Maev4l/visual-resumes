// Delegating config: shared/ has no package.json, so it re-exports the functions config
// to give ESLint a discovery anchor while keeping rules in one place.
export { default } from '../functions/eslint.config.js';
