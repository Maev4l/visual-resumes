import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { processPhoto, outputKeyFor, parseUploadKey } from './resize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = fs.readFileSync(path.join(here, 'fixtures', 'test-600x400.jpg'));

describe('resize', () => {
  describe('parseUploadKey', () => {
    it('extracts customId + resumeId from photo-uploads/<customId>/<resumeId>', () => {
      assert.deepEqual(parseUploadKey('photo-uploads/U1/R1'), { customId: 'U1', resumeId: 'R1' });
      assert.deepEqual(parseUploadKey('photo-uploads/USER-ABC/R-XYZ'), { customId: 'USER-ABC', resumeId: 'R-XYZ' });
    });

    it('returns null for unexpected key shapes (safety net — trigger should prevent this)', () => {
      assert.equal(parseUploadKey('users/U1/resumes/R1.json'), null);
      assert.equal(parseUploadKey('photo-uploads/U1'), null);
      assert.equal(parseUploadKey('photo-uploads/U1/R1/extra'), null);
    });
  });

  describe('outputKeyFor', () => {
    it('returns the durable photo path (.webp)', () => {
      assert.equal(outputKeyFor({ customId: 'U1', resumeId: 'R1' }), 'users/U1/photos/R1.webp');
    });
  });

  describe('processPhoto', () => {
    it('produces a WebP with longest side = 600px, preserving aspect ratio (600x400 → 600x400, 800x600 → 600x450)', async () => {
      const big = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 180, g: 40, b: 90 } } })
        .jpeg({ quality: 85 }).toBuffer();
      const out = await processPhoto(big);
      const meta = await sharp(out).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.width, 600);
      assert.equal(meta.height, 450);
    });

    it('does not upscale smaller photos', async () => {
      const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#888' } })
        .png().toBuffer();
      const out = await processPhoto(small);
      const meta = await sharp(out).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.width, 300);
      assert.equal(meta.height, 200);
    });

    it('accepts JPEG / PNG / WebP inputs and always outputs WebP', async () => {
      const out = await processPhoto(sample);
      const meta = await sharp(out).metadata();
      assert.equal(meta.format, 'webp');
    });

    it('fails fast on invalid bytes', async () => {
      await assert.rejects(() => processPhoto(Buffer.from('not an image')));
    });
  });
});
