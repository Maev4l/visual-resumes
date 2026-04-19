import sharp from 'sharp';

// Upload keys are: photo-uploads/<customId>/<resumeId>
// WHY a strict regex: S3 triggers already filter on the prefix, but the Lambda
// still defends against unexpected shapes (e.g. manual uploads during debug).
const UPLOAD_KEY_RE = /^photo-uploads\/([^/]+)\/([^/]+)$/;

export const parseUploadKey = (key) => {
  const m = UPLOAD_KEY_RE.exec(key);
  return m ? { customId: m[1], resumeId: m[2] } : null;
};

export const outputKeyFor = ({ customId, resumeId }) =>
  `users/${customId}/photos/${resumeId}.webp`;

/**
 * Resize a raw photo buffer to 600px longest side (aspect-preserving, no upscale),
 * strip metadata (including EXIF/GPS), encode as WebP q80. Returns the WebP buffer.
 *
 * WHY .rotate() before resize: honours EXIF orientation so phone photos aren't sideways.
 * Sharp strips metadata by default when we don't call .withMetadata(), which also drops GPS.
 */
export const processPhoto = async (inputBuffer) =>
  sharp(inputBuffer)
    .rotate()
    .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
