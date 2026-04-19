// GET /api/resumes — returns trimmed summaries for the dashboard (no section data).
import { ok } from '../lib/http.js';
import { extractUser } from '../lib/auth.js';
import { listMyResumes } from '../lib/storage-private.js';
import { config } from '../config.js';

export const listResumes = async (event) => {
  const user = extractUser(event);
  const rows = await listMyResumes({ bucket: config.storageBucket, customId: user.customId });
  // Project just the dashboard-relevant fields; the full resume is only fetched on edit.
  const resumes = rows.map((r) => ({
    id: r.id,
    title: r.title,
    templateId: r.templateId,
    paperSize: r.paperSize,
    published: r.published,
    updatedAt: r._lastModified,
  }));
  return ok({ resumes });
};
