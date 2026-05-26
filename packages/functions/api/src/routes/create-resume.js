// POST /api/resumes — mints a ULID, writes an empty resume with IfNoneMatch: '*'.
import { validateCreate } from '../lib/validation.js';
import { putResumeInitial } from '../lib/storage-private.js';
import { newResumeId } from '../lib/ids.js';
import { config } from '../config.js';

export const createResume = async (c) => {
  const customId = c.get('customId');
  const body = await c.req.json();

  const v = validateCreate(body);
  if (!v.valid) {
    return c.json({ error: 'ValidationError', message: 'invalid create payload', errors: v.errors }, 400);
  }

  // WHY explicit shape: editor expects a fully-populated resume back in the 201 body
  // so it can skip an immediate GET on the new id.
  const resume = {
    id: newResumeId(),
    ownerCustomId: customId,
    title: body.title,
    templateId: body.templateId,
    paperSize: body.paperSize,
    photoKey: null,
    sections: [],
    published: null,
  };

  const { etag } = await putResumeInitial({
    bucket: config.storageBucket,
    customId,
    resumeId: resume.id,
    resume,
  });

  c.header('etag', etag);
  return c.json({ resume, etag }, 201);
};
