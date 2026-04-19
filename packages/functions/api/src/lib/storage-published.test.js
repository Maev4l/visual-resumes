import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { revokePublished, publishedKeys } from './storage-published.js';

const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

beforeEach(() => { s3.reset(); cf.reset(); });

describe('storage-published', () => {
  it('publishedKeys builds html/pdf/jpg keys', () => {
    assert.deepEqual(publishedKeys('abc123def456'), {
      html: 'resumes/abc123def456.html',
      pdf:  'resumes/abc123def456.pdf',
      jpg:  'resumes/abc123def456.jpg',
    });
  });

  it('revokePublished deletes all 3 objects then issues a CF invalidation', async () => {
    s3.on(DeleteObjectCommand).resolves({});
    cf.on(CreateInvalidationCommand).resolves({ Invalidation: { Id: 'I1' } });

    await revokePublished({
      publishedBucket: 'visual-resumes-published',
      distributionId: 'DIST123',
      slug: 'abc123def456',
    });

    const deletedKeys = s3.commandCalls(DeleteObjectCommand).map((c) => c.args[0].input.Key);
    assert.deepEqual(deletedKeys.sort(), ['resumes/abc123def456.html', 'resumes/abc123def456.jpg', 'resumes/abc123def456.pdf']);

    const inv = cf.commandCalls(CreateInvalidationCommand)[0].args[0].input;
    assert.equal(inv.DistributionId, 'DIST123');
    assert.deepEqual(inv.InvalidationBatch.Paths.Items.sort(), ['/resumes/abc123def456.html', '/resumes/abc123def456.jpg', '/resumes/abc123def456.pdf']);
    assert.equal(inv.InvalidationBatch.Paths.Quantity, 3);
  });
});
