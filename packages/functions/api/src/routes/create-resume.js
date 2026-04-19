// POST /api/resumes — mints a ULID, writes an empty resume with IfNoneMatch: '*'.
import { created, error, parseBody, withEtag } from '../lib/http.js';
import { extractUser } from '../lib/auth.js';
import { validateCreate } from '../lib/validation.js';
import { putResumeInitial } from '../lib/storage-private.js';
import { newResumeId } from '../lib/ids.js';
import { config } from '../config.js';

export const createResume = async (event) => {
  const user = extractUser(event);
  const body = parseBody(event);

  const v = validateCreate(body);
  if (!v.valid) return error(400, 'ValidationError', 'invalid create payload', { errors: v.errors });

  // WHY explicit shape: editor expects a fully-populated resume back in the 201 body
  // so it can skip an immediate GET on the new id.
  const resume = {
    id: newResumeId(),
    ownerCustomId: user.customId,
    title: body.title,
    templateId: body.templateId,
    paperSize: body.paperSize,
    photoKey: null,
    sections: [],
    published: null,
  };

  const { etag } = await putResumeInitial({
    bucket: config.storageBucket,
    customId: user.customId,
    resumeId: resume.id,
    resume,
  });

  return withEtag(created({ resume, etag }), etag);
};
