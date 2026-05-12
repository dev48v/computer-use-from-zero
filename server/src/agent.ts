// STEP 6 — Agent loop. The heart of the project.
//
// The loop is brutally simple — three lines of pseudocode:
//   while not done and steps < cap:
//     screenshot → plan next action → execute → record step
//
// Every layer beneath this file exists so this loop can stay short.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { launchBrowser, screenshotBase64, closeBrowser } from './browser.js';
import { planNextAction } from './gemini.js';
import { executeAction } from './executor.js';
import type { AgentStep, RunMeta } from './types.js';

export interface RunHandle {
  meta: RunMeta;
  steps: AgentStep[];
  emit: (event: { type: 'step' | 'done' | 'error'; payload: unknown }) => void;
}

// Single in-memory registry. Runs are ephemeral — when the container
// restarts, history is lost. For a learning demo that's fine; a real
// product would push to S3/Postgres.
const runs = new Map<string, RunHandle>();

export const getRun = (id: string): RunHandle | undefined => runs.get(id);
export const listRuns = (): RunMeta[] =>
  Array.from(runs.values())
    .map((r) => r.meta)
    .sort((a, b) => b.startedAt - a.startedAt);

type RunListener = (event: { type: 'step' | 'done' | 'error'; payload: unknown }) => void;

export const startRun = async (
  goal: string,
  onEvent: RunListener,
): Promise<string> => {
  const id = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  const runDir = join(process.cwd(), 'runs', id);
  await mkdir(runDir, { recursive: true });

  const meta: RunMeta = {
    id,
    goal,
    startedAt,
    finishedAt: null,
    status: 'running',
    finalAnswer: null,
    error: null,
    steps: 0,
  };
  const steps: AgentStep[] = [];
  const handle: RunHandle = {
    meta,
    steps,
    emit: onEvent,
  };
  runs.set(id, handle);

  // Kick off the loop in the background — the HTTP request that
  // created the run returns immediately with the id. The client
  // then opens an SSE stream to watch progress.
  void runLoop(handle, goal, runDir);

  return id;
};

const runLoop = async (
  handle: RunHandle,
  goal: string,
  runDir: string,
): Promise<void> => {
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser();
    const { page } = browser;

    for (let i = 0; i < config.maxSteps; i++) {
      const stepNum = i + 1;
      // Always wait a tick for any pending nav to settle before
      // screenshotting. Without it the model sometimes plans the
      // next click before the prior nav repainted.
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});

      const screenshot = await screenshotBase64(page);
      const screenshotPath = `step-${String(stepNum).padStart(2, '0')}.png`;
      await writeFile(join(runDir, screenshotPath), Buffer.from(screenshot, 'base64'));

      const url = page.url();
      const title = await page.title().catch(() => '');

      const action = await planNextAction(goal, handle.steps, screenshot, url);

      const step: AgentStep = {
        step: stepNum,
        timestamp: Date.now(),
        screenshotPath,
        reasoning: action.reason,
        action,
        url,
        title,
      };
      handle.steps.push(step);
      handle.meta.steps = stepNum;
      handle.emit({ type: 'step', payload: step });

      if (action.type === 'done') {
        handle.meta.status = 'done';
        handle.meta.finalAnswer = action.answer;
        handle.meta.finishedAt = Date.now();
        handle.emit({ type: 'done', payload: { answer: action.answer } });
        return;
      }

      await executeAction(page, action);
    }

    // Hit the step cap without `done`. Mark as failed-by-timeout so
    // the UI surfaces it differently than an exception.
    handle.meta.status = 'failed';
    handle.meta.error = `Step cap (${config.maxSteps}) reached without "done" action`;
    handle.meta.finishedAt = Date.now();
    handle.emit({ type: 'error', payload: { error: handle.meta.error } });
  } catch (err) {
    handle.meta.status = 'failed';
    handle.meta.error = (err as Error).message;
    handle.meta.finishedAt = Date.now();
    handle.emit({ type: 'error', payload: { error: handle.meta.error } });
  } finally {
    if (browser) await closeBrowser(browser);
  }
};
