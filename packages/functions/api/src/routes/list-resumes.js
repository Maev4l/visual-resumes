// GET /api/resumes — returns trimmed summaries for the dashboard (no section data).
import { listMyResumes } from '../lib/storage-private.js';
import { config } from '../config.js';

export const listResumes = async (c) => {
  const customId = c.get('customId');
  const rows = await listMyResumes({ bucket: config.storageBucket, customId });
  // Project just the dashboard-relevant fields; the full resume is only fetched on edit.
  const resumes = rows.map((r) => ({
    id: r.id,
    title: r.title,
    templateId: r.templateId,
    paperSize: r.paperSize,
    published: r.published,
    updatedAt: r._lastModified,
  }));
  return c.json({ resumes });
};
