// Private-bucket helpers. Every function takes `{ client }` so tests can swap in a
// mocked S3Client (via aws-sdk-client-mock) without global state.
import {
  S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3';

const s3 = new S3Client({});

// Key layout: users/<customId>/resumes/<resumeId>.json for the editable JSON.
export const resumeKey = (customId, resumeId) => `users/${customId}/resumes/${resumeId}.json`;
// Processed photos are always 600px WebP, produced by the image-resizer Lambda.
export const photoKey = (customId, resumeId) => `users/${customId}/photos/${resumeId}.webp`;
// Raw uploads land at a top-level prefix so the bucket lifecycle rule can TTL-expire
// orphaned uploads (user bailed before image-resizer finished).
export const photoUploadKey = (customId, resumeId) => `photo-uploads/${customId}/${resumeId}`;

export const listMyResumes = async ({ bucket, customId, client = s3 }) => {
  const list = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: `users/${customId}/resumes/`,
  }));
  const keys = (list.Contents ?? []).map((o) => o.Key).filter((k) => k.endsWith('.json'));

  // Parallel GET — user base is ~5 with at most a handful of resumes each, so no
  // concurrency limit needed.
  const rows = await Promise.all(keys.map(async (Key) => {
    const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key }));
    const json = await obj.Body.transformToString();
    const resume = JSON.parse(json);
    return {
      ...resume,
      _etag: obj.ETag,
      _lastModified: obj.LastModified?.toISOString?.() ?? null,
    };
  }));

  return rows;
};

export const getResume = async ({ bucket, customId, resumeId, client = s3 }) => {
  try {
    const obj = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: resumeKey(customId, resumeId),
    }));
    const resume = JSON.parse(await obj.Body.transformToString());
    return { resume, etag: obj.ETag };
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
};

export const putResumeInitial = async ({ bucket, customId, resumeId, resume, client = s3 }) => {
  // IfNoneMatch: '*' → fail if the object already exists. Prevents create-after-create
  // collisions (should be impossible with a ULID but cheap defense-in-depth).
  const result = await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: resumeKey(customId, resumeId),
    Body: JSON.stringify(resume),
    ContentType: 'application/json',
    IfNoneMatch: '*',
  }));
  return { etag: result.ETag };
};

export const putResumeConditional = async ({ bucket, customId, resumeId, resume, etag, client = s3 }) => {
  // IfMatch: <etag> → S3 returns 412 PreconditionFailed on mismatch. That's the optimistic
  // concurrency primitive the editor uses for save conflicts.
  const result = await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: resumeKey(customId, resumeId),
    Body: JSON.stringify(resume),
    ContentType: 'application/json',
    IfMatch: etag,
  }));
  return { etag: result.ETag };
};

export const deleteResumeObjects = async ({ bucket, customId, resumeId, client = s3 }) => {
  // Best-effort cascade: delete JSON, processed photo, and any in-flight raw upload.
  // A missing key just returns 204 from S3 so the Promise.all is safe.
  const keys = [
    resumeKey(customId, resumeId),
    photoKey(customId, resumeId),
    photoUploadKey(customId, resumeId),
  ];
  await Promise.all(keys.map((Key) =>
    client.send(new DeleteObjectCommand({ Bucket: bucket, Key })),
  ));
};

/**
 * Read the processed photo (WebP) and return a data URI. Returns null if the photo
 * doesn't exist yet — normal during the gap between upload and image-resizer processing.
 */
export const loadPhotoDataUri = async ({ bucket, customId, resumeId, client = s3 }) => {
  try {
    const obj = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: photoKey(customId, resumeId),
    }));
    const buf = Buffer.from(await obj.Body.transformToByteArray());
    return `data:image/webp;base64,${buf.toString('base64')}`;
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
};
