// STEP 8 — Express bootstrap.
//
// Lightweight here because the agent runs ASYNC after a run is
// created — the HTTP layer is mostly start/list/stream + screenshot
// serving.
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { runsRouter } from './routes/runs.js';

const app = express();

app.use(
  cors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : true }),
);
app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), model: config.geminiModel });
});

app.use('/api', runsRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: err instanceof Error ? err.message : 'Internal server error',
  });
};
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
  console.log(`Gemini model: ${config.geminiModel}`);
});

const shutdown = (signal: string): void => {
  console.log(`Received ${signal}, closing server`);
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
