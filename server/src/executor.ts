// STEP 5 — Action executor. One file maps each AgentAction type to
// the Playwright call that performs it.
//
// Splitting this out from the agent loop keeps the loop pure (pick
// action → execute → observe) and makes adding new actions a single-
// file change.
import type { Page } from 'playwright';
import type { AgentAction } from './types.js';

export const executeAction = async (page: Page, action: AgentAction): Promise<void> => {
  switch (action.type) {
    case 'click':
      // Playwright's page.mouse.click takes viewport-relative coords,
      // which matches what we asked Gemini to produce. We clamp to
      // viewport to defend against the model returning out-of-bounds
      // coordinates on tricky pages.
      await page.mouse.click(
        Math.max(0, Math.min(1280, action.x)),
        Math.max(0, Math.min(800, action.y)),
      );
      break;

    case 'type':
      // page.keyboard.type sends individual keystrokes — works for
      // search boxes, inputs, and contenteditable. We don't focus
      // first because Gemini's previous action was almost certainly
      // a click that already gave focus.
      await page.keyboard.type(action.text, { delay: 20 });
      break;

    case 'press':
      await page.keyboard.press(action.key);
      break;

    case 'scroll':
      // page.mouse.wheel scrolls the viewport. We pass 0 for dx
      // because horizontal scrolling on a search-and-click agent is
      // almost always wrong — we'd rather the model use `goto` to
      // jump pages than fight horizontal layouts.
      await page.mouse.wheel(0, action.dy);
      break;

    case 'goto':
      await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      break;

    case 'wait':
      // Clamp to a sane upper bound. The model has occasionally
      // returned wait { ms: 60000 } when it should have given up;
      // hard ceiling at 8s prevents stalled runs.
      await page.waitForTimeout(Math.min(action.ms, 8_000));
      break;

    case 'done':
      // No-op at the executor level. The agent loop reads `done`
      // and exits.
      break;
  }
};
