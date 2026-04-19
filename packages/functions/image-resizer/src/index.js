import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { processPhoto, outputKeyFor, parseUploadKey } from './resize.js';

const s3 = new S3Client({});

const processRecord = async (record) => {
  const bucket = record.s3?.bucket?.name;
  const keyRaw = record.s3?.object?.key;
  if (!bucket || !keyRaw) {
    console.warn('image-resizer: malformed record, skipping', JSON.stringify(record));
    return;
  }
  // WHY decode: S3 delivers keys percent-encoded with '+' meaning space (form-urlencoded).
  // If we don't decode, GetObject on a key with a space fails with NoSuchKey.
  const key = decodeURIComponent(keyRaw.replace(/\+/g, ' '));

  const parsed = parseUploadKey(key);
  if (!parsed) {
    // Safety net — the S3 trigger filter should already restrict to photo-uploads/*.
    console.log(`image-resizer: skip (unexpected key shape) ${key}`);
    return;
  }

  const outputKey = outputKeyFor(parsed);

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buf = Buffer.from(await obj.Body.transformToByteArray());
    const webp = await processPhoto(buf);

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: outputKey,
      Body: webp,
      ContentType: 'image/webp',
      CacheControl: 'private, max-age=300',
    }));

    console.log(`image-resizer: wrote ${outputKey} (${webp.length} bytes)`);
    // WHY no DeleteObject: the bucket lifecycle rule (expire-photo-uploads, 1-day TTL)
    // reaps photo-uploads/* automatically. Fewer IAM grants, fewer calls, same end state.
  } catch (err) {
    // WHY swallow: malformed uploads would otherwise trigger S3 retry storms.
    // Per-record errors are logged and the event as a whole still "succeeds".
    console.error(`image-resizer: failed for ${key}:`, err?.message ?? err);
  }
};

export const handler = async (event) => {
  const records = event?.Records ?? [];
  for (const record of records) {
    await processRecord(record);
  }
  return { ok: true, processed: records.length };
};
