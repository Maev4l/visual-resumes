// POST /api/resumes/{id}/photo — presigned PUT to the raw upload prefix.
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
export const photoUploadUrl = async (c) => {
  const customId = c.get('customId');
  const resumeId = c.req.param('id');

  // Enforce the resume exists + belongs to the caller before minting a URL, otherwise
  // we'd hand out usable URLs for non-owned resume IDs (IAM would still block at S3
  // but cheap to fail fast).
  const got = await getResume({
    bucket: config.storageBucket,
    customId,
    resumeId,
  });
  if (!got) return c.json({ error: 'NotFound', message: `resume ${resumeId} not found` }, 404);
  if (got.resume.ownerCustomId !== customId) {
    return c.json({ error: 'Forbidden', message: 'not your resume' }, 403);
  }

  const uploadKey = photoUploadKey(customId, resumeId);
  const finalPhotoKey = photoKey(customId, resumeId);

  // Content-Type is whatever the browser sends; the image-resizer normalizes to WebP.
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: config.storageBucket,
      Key: uploadKey,
    }),
    { expiresIn: EXPIRES },
  );

  return c.json({ uploadUrl, photoKey: finalPhotoKey, expiresIn: EXPIRES, maxBytes: MAX_BYTES });
};
