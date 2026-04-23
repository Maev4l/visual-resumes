import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

let cached = null;

// Dockerfile extracts the arm64 Chromium pack to this dir at build time — chromium-min
// ships no binary so we must tell it where to find the pre-extracted Brotli files.
const CHROMIUM_PACK_DIR = process.env.CHROMIUM_PACK_DIR ?? '/opt/chromium';

/**
 * Launches a Chromium browser in Lambda. Returns `{ browser, close }`.
 * Re-uses the same browser across warm invocations to cut cold-start cost.
 * The caller is responsible for closing pages; `close()` is only used from a SIGTERM handler or tests.
 */
export const launchBrowser = async () => {
  if (cached?.browser?.isConnected?.()) return cached;

  const browser = await puppeteer.launch({
    args: [...chromium.args, '--disable-gpu', '--disable-dev-shm-usage'],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(CHROMIUM_PACK_DIR),
    headless: true,
  });
  cached = {
    browser,
    close: async () => {
      await browser.close();
      cached = null;
    },
  };
  return cached;
};

/**
 * Render an HTML string to a PDF buffer.
 * @param {string} html — complete self-contained HTML (CSS already inlined).
 * @param {'A4'|'Letter'} format
 */
export const htmlToPdf = async (html, format) => {
  const { browser } = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // `preferCSSPageSize: true` lets each template's @page rule dictate its own
    // margins. Monaco sets `@page { margin: 14mm }` for traditional print margins;
    // modern + avant set `@page { margin: 0 }` so their full-bleed horizontal bars
    // reach the page edges. A hardcoded puppeteer `margin` would override all of that.
    return await page.pdf({
      format,
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await page.close();
  }
};
