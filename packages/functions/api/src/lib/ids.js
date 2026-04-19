// WHY ULID: time-ordered + URL-safe + same shape for resumes and sections. Lets us sort
// a list of resumes by ID without a separate createdAt field.
import { ulid } from 'ulid';

export const newResumeId = () => ulid();
export const newSectionId = () => ulid();

// Slug alphabet/length exposed as constants — the renderer Lambda generates slugs at
// publish time using nanoid with this alphabet. WHY lowercase-alphanumeric: the schema
// enforces /^[0-9a-z]{12}$/ on published.slug.
export const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export const SLUG_LENGTH = 12;
