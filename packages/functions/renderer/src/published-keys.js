// Slug → S3 key map for the published bucket. Two artifacts only: HTML and PDF.
// The processed photo (when present) is embedded inline as a base64 data URI inside the HTML
// rather than written as a separate object — keeps the published bucket cheaper to invalidate
// and makes a single-file HTML download self-contained.
export const publishedKeys = (slug) => ({
  html: `resumes/${slug}.html`,
  pdf:  `resumes/${slug}.pdf`,
});
