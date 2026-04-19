// POST /api/resumes/{id}/photo — presigned PUT to the raw upload prefix.
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ok, error } from '../lib/http.js';
import { extractUser } from '../lib/auth.js';
import { getResume, photoKey, photoUploadKey } from '../lib/storage-private.js';
import { config } from '../config.js';

const s3 = new S3Client({});

const MAX_BYTES = 5 * 1024 * 1024;
const EXPIRES = 300; // seconds

/**
 * Issue a presigned PUT URL so the editor can upload a raw photo directly to
 * photo-uploads/<customId>/<resumeId>. The image-resizer Lambda picks it up
 * (S3 ObjectCreated event), produces a 600px WebP at users/<customId>/photos/<resumeId>.webp,
 * and the bucket lifecycle rule reaps the raw upload after 1 day.
 *
 * Returns:
 *   uploadUrl — presigned PUT for photo-uploads
 *   photoKey  — deterministic final key the client should persist on resume.photoKey
 */
export const photoUploadUrl = async (event) => {
  const user = extractUser(event);
  const resumeId = event.pathParameters?.id;
  if (!resumeId) return error(400, 'BadRequest', 'missing id path parameter');

  // Enforce the resume exists + belongs to the caller before minting a URL, otherwise
  // we'd hand out usable URLs for non-owned resume IDs (IAM would still block at S3
  // but cheap to fail fast).
  const got = await getResume({
    bucket: config.storageBucket,
    customId: user.customId,
    resumeId,
  });
  if (!got) return error(404, 'NotFound', `resume ${resumeId} not found`);
  if (got.resume.ownerCustomId !== user.customId) {
    return error(403, 'Forbidden', 'not your resume');
  }

  const uploadKey = photoUploadKey(user.customId, resumeId);
  const finalPhotoKey = photoKey(user.customId, resumeId);

  // Content-Type is whatever the browser sends; the image-resizer normalizes to WebP.
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: config.storageBucket,
      Key: uploadKey,
    }),
    { expiresIn: EXPIRES },
  );

  return ok({ uploadUrl, photoKey: finalPhotoKey, expiresIn: EXPIRES, maxBytes: MAX_BYTES });
};
