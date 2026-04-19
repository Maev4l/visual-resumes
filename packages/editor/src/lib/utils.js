import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Combines conditional class names, then deduplicates/normalizes tailwind utilities
// so later classes beat earlier ones the way the underlying tailwind cascade expects.
export const cn = (...inputs) => twMerge(clsx(inputs));
