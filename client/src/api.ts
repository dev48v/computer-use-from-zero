// Typed fetch wrapper + SSE subscriber.
import type { AgentStep, RunMeta } from './types';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const screenshotUrl = (runId: string, name: string): string =>
  `${BASE}/api/runs/${runId}/screenshots/${name}`;

export const startRun = async (goal: string): Promise<{ id: string }> => {
  const res = await fetch(`${BASE}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as { id: string };
};

export const getRun = async (
  id: string,
): Promise<{ meta: RunMeta; steps: AgentStep[] }> => {
  const res = await fetch(`${BASE}/api/runs/${id}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as { meta: RunMeta; steps: AgentStep[] };
};

export interface RunStream {
  close: () => void;
}

// EventSource is the browser's built-in SSE client. We attach typed
// handlers per event name (step, done, error) so the React component
// can update state predictably.
export const streamRun = (
  id: string,
  handlers: {
    onStep: (step: AgentStep) => void;
    onDone: (answer: string | null) => void;
    onError: (msg: string) => void;
  },
): RunStream => {
  const es = new EventSource(`${BASE}/api/runs/${id}/stream`);
  es.addEventListener('step', (e) => {
    const step = JSON.parse((e as MessageEvent).data) as AgentStep;
    handlers.onStep(step);
  });
  es.addEventListener('done', (e) => {
    const { answer } = JSON.parse((e as MessageEvent).data) as { answer: string | null };
    handlers.onDone(answer);
    es.close();
  });
  es.addEventListener('error', (e) => {
    // EventSource fires an `error` event on network drops AND on our
    // custom server-sent error events. Distinguish by inspecting data.
    const data = (e as MessageEvent).data;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data) as { error?: string };
        if (parsed.error) {
          handlers.onError(parsed.error);
          es.close();
          return;
        }
      } catch {
        // Fall through to silent network error — browser will retry.
      }
    }
  });
  return { close: () => es.close() };
};
