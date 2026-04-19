import { customAlphabet } from 'nanoid';

// 36^12 = ~4.7e18 keyspace. Wider than ULID's monotonic time prefix (which would expose
// publish ordering) and short enough to type from a phone screen. Lowercase + digits only:
// case-insensitive URLs, no hyphens to confuse double-click selection.
export const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export const SLUG_LENGTH = 12;

const generate = customAlphabet(SLUG_ALPHABET, SLUG_LENGTH);

export const newSlug = () => generate();
