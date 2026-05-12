// STEP 3 — Browser adapter (Playwright wrapper).
//
// Why a tiny adapter and not just `import { chromium } from 'playwright'`
// inline? Three reasons:
//   1. Centralises the launch flags (headless, viewport, no-sandbox)
//      so future tweaks happen in ONE place.
//   2. Exposes a narrow API (click/type/scroll/goto/screenshot) that
//      matches the AgentAction shape one-to-one — the agent loop never
//      sees Playwright details.
//   3. Tests can mock this module instead of the full Playwright lib.
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { config } from './config.js';

export interface BrowserHandle {
  page: Page;
  context: BrowserContext;
  browser: Browser;
}

export const launchBrowser = async (): Promise<BrowserHandle> => {
  // Render free-tier containers run unprivileged → Chrome's sandbox
  // can't be set up. --no-sandbox is the documented workaround.
  // Locally we'd ideally leave the sandbox on, but Playwright handles
  // both cases — the flag is a no-op when the sandbox is available.
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // --disable-dev-shm-usage swaps Chrome's /dev/shm cache (64MB
      // on Docker by default) for /tmp. Without it, Chrome crashes
      // on memory-heavy pages.
      '--disable-dev-shm-usage',
      // disable-gpu trims Chrome's RAM by ~40MB on headless. Free
      // tier needs every MB.
      '--disable-gpu',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: config.viewportWidth, height: config.viewportHeight },
    // A real-Chrome UA reduces bot-detection 403s from sites like
    // Vercel-hosted demos that bounce headless fingerprints.
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  // Strip the navigator.webdriver flag — another common bot-check.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();
  await page.goto(config.startUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  return { browser, context, page };
};

export const screenshotBase64 = async (page: Page): Promise<string> => {
  // Full-viewport PNG, no `fullPage: true` because we want what the
  // user (and model) would see. Returns base64 — Gemini's vision
  // API accepts inlineData with mime + base64 string.
  const buf = await page.screenshot({ type: 'png', fullPage: false });
  return buf.toString('base64');
};

export const closeBrowser = async (handle: BrowserHandle): Promise<void> => {
  await handle.context.close().catch(() => {});
  await handle.browser.close().catch(() => {});
};
