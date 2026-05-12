// STEP 7 — HTTP + SSE routes.
//
//   POST /api/runs            { goal } → { id }       start a run
//   GET  /api/runs            list all runs
//   GET  /api/runs/:id        run meta + full step history
//   GET  /api/runs/:id/stream Server-Sent Events stream of live steps
//   GET  /api/runs/:id/screenshots/:name.png  serve a stored screenshot
//
// Why SSE instead of WebSocket? The agent only ever pushes one
// direction (server → client), and SSE survives every reverse proxy
// and corporate firewall — a WebSocket needs Upgrade headers that
// some platforms strip. Less code, more reach.
import { Router, type Request, type Response } from 'express';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { getRun, listRuns, startRun } from '../agent.js';

export const runsRouter = Router();

runsRouter.post('/runs', async (req, res) => {
  const goal = String(req.body?.goal ?? '').trim();
  if (!goal) {
    res.status(400).json({ error: 'goal is required' });
    return;
  }
  if (goal.length > 500) {
    res.status(400).json({ error: 'goal too long (max 500 chars)' });
    return;
  }
  try {
    const id = await startRun(goal, () => { /* no listener at start */ });
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

runsRouter.get('/runs', (_req, res) => {
  res.json({ items: listRuns() });
});

runsRouter.get('/runs/:id', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  res.json({ meta: run.meta, steps: run.steps });
});

runsRouter.get('/runs/:id/stream', (req: Request, res: Response) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  // SSE handshake. The three headers below are the spec; without
  // any one of them browsers refuse to enter EventSource mode.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Render's edge buffers responses by default — this header tells
  // it to disable buffering so events flush in real time.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Replay any steps that have already happened — handles "client
  // connected late" without us having to journal to disk.
  for (const step of run.steps) {
    res.write(`event: step\ndata: ${JSON.stringify(step)}\n\n`);
  }
  if (run.meta.status !== 'running') {
    res.write(
      `event: ${run.meta.status === 'done' ? 'done' : 'error'}\ndata: ${JSON.stringify({
        answer: run.meta.finalAnswer,
        error: run.meta.error,
      })}\n\n`,
    );
    res.end();
    return;
  }

  // Hook into future events. The agent's emit() calls this listener.
  const original = run.emit;
  run.emit = (event) => {
    original(event);
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
    if (event.type === 'done' || event.type === 'error') {
      res.end();
    }
  };

  // Heartbeat every 15s. Renders the connection alive through
  // intermediaries that close idle TCP connections at ~30s.
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15_000);
  req.on('close', () => clearInterval(heartbeat));
});

runsRouter.get('/runs/:id/screenshots/:name', async (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).end();
    return;
  }
  // Defence-in-depth: only allow filenames that match our pattern.
  // Without this an attacker could pass `name=../../etc/passwd`.
  if (!/^step-\d+\.png$/.test(req.params.name)) {
    res.status(400).end();
    return;
  }
  const filePath = join(process.cwd(), 'runs', run.meta.id, req.params.name);
  try {
    await stat(filePath);
  } catch {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', 'image/png');
  createReadStream(filePath).pipe(res);
});
