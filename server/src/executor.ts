// STEP 5 — Action executor. One file maps each AgentAction type to
// the Playwright call that performs it.
//
// Defensive note: Gemini's structured-output schema marks every
// action-specific field as OPTIONAL (only `type` and `reason` are
// required), so the model is FREE to return `{type:'press'}` with no
// `key`. We must validate at runtime before calling Playwright —
// otherwise we'd crash the whole run on a single bad action.
import type { Page } from 'playwright';
import type { AgentAction } from './types.js';

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;

export const executeAction = async (page: Page, action: AgentAction): Promise<void> => {
  switch (action.type) {
    case 'click': {
      if (!isFiniteNumber(action.x) || !isFiniteNumber(action.y)) {
        console.warn('[executor] click missing x/y — skipping');
        return;
      }
      // Clamp to viewport to defend against out-of-bounds coords on
      // tricky pages.
      await page.mouse.click(
        Math.max(0, Math.min(1280, action.x)),
        Math.max(0, Math.min(800, action.y)),
      );
      break;
    }

    case 'type': {
      if (!isNonEmptyString(action.text)) {
        console.warn('[executor] type missing text — skipping');
        return;
      }
      await page.keyboard.type(action.text, { delay: 20 });
      break;
    }

    case 'press': {
      if (!isNonEmptyString(action.key)) {
        console.warn('[executor] press missing key — skipping');
        return;
      }
      await page.keyboard.press(action.key);
      break;
    }

    case 'scroll': {
      if (!isFiniteNumber(action.dy)) {
        console.warn('[executor] scroll missing dy — skipping');
        return;
      }
      await page.mouse.wheel(0, action.dy);
      break;
    }

    case 'goto': {
      if (!isNonEmptyString(action.url)) {
        console.warn('[executor] goto missing url — skipping');
        return;
      }
      await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      break;
    }

    case 'wait': {
      const ms = isFiniteNumber(action.ms) ? action.ms : 1000;
      await page.waitForTimeout(Math.min(ms, 8_000));
      break;
    }

    case 'done':
      // No-op at the executor level. The agent loop reads `done` and exits.
      break;
  }
};
