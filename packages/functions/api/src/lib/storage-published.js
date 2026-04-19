// Revoke = delete published artifacts from the published bucket + invalidate the CloudFront
// cache. WHY both: S3 delete alone leaves the CF edge cache serving the old object until TTL.
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

const s3 = new S3Client({});
const cf = new CloudFrontClient({});

// Three artifacts per published resume: the HTML page, the PDF download, and a
// preview JPG (for sharing / og:image).
export const publishedKeys = (slug) => ({
  html: `resumes/${slug}.html`,
  pdf:  `resumes/${slug}.pdf`,
  jpg:  `resumes/${slug}.jpg`,
});

export const revokePublished = async ({
  publishedBucket,
  distributionId,
  slug,
  s3Client = s3,
  cfClient = cf,
}) => {
  const keys = Object.values(publishedKeys(slug));

  await Promise.all(keys.map((Key) =>
    s3Client.send(new DeleteObjectCommand({ Bucket: publishedBucket, Key })),
  ));

  const paths = keys.map((k) => `/${k}`);
  await cfClient.send(new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      // CallerReference must be unique per request; slug+ms is sufficient.
      CallerReference: `revoke-${slug}-${Date.now()}`,
      Paths: { Quantity: paths.length, Items: paths },
    },
  }));
};
