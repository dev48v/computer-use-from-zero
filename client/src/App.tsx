// Day 33 single-page UI: goal input → start → live screenshot
// stream + reasoning log + final answer.
//
// No router (one page only). All state is in this component because
// it's all run-scoped — moving it to context would buy nothing.
import { useEffect, useRef, useState } from 'react';
import { screenshotUrl, startRun, streamRun } from './api';
import type { AgentStep } from './types';

const PRESETS = [
  'Search Wikipedia for "Mars" and report its diameter in km.',
  'Find the current price of AAPL stock on Google Finance.',
  'Look up today\'s weather in Tokyo, Japan and report the temperature.',
  'Find the GitHub repo "playwright" and report its star count.',
];

export const App = () => {
  const [goal, setGoal] = useState(PRESETS[0]);
  const [runId, setRunId] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [finalAnswer, setFinalAnswer] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);

  useEffect(() => {
    return () => streamRef.current?.close();
  }, []);

  const onStart = async (): Promise<void> => {
    setSteps([]);
    setFinalAnswer(null);
    setErrorMsg(null);
    setStatus('running');
    try {
      const { id } = await startRun(goal);
      setRunId(id);
      streamRef.current?.close();
      streamRef.current = streamRun(id, {
        onStep: (step) => setSteps((prev) => [...prev, step]),
        onDone: (answer) => {
          setFinalAnswer(answer);
          setStatus('done');
        },
        onError: (msg) => {
          setErrorMsg(msg);
          setStatus('failed');
        },
      });
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('failed');
    }
  };

  const latest = steps[steps.length - 1];

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-dot" />
          <span>Vision Agent</span>
          <span className="brand-tag">Computer Use From Zero</span>
        </div>
        <a
          href="https://github.com/dev48v/computer-use-from-zero"
          target="_blank"
          rel="noreferrer noopener"
          className="header-link"
        >
          GitHub →
        </a>
      </header>

      <main className="main">
        <section className="goal-panel">
          <h1>Give the agent a goal.</h1>
          <p className="muted">
            Gemini 2.5 Pro sees the browser screen, decides one action at a time, and Playwright executes.
          </p>

          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={p === goal ? 'preset active' : 'preset'}
                onClick={() => setGoal(p)}
                disabled={status === 'running'}
              >
                {p}
              </button>
            ))}
          </div>

          <textarea
            className="goal-input"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={status === 'running'}
            rows={3}
            maxLength={500}
            placeholder="Type a goal..."
          />
          <button
            className="run-btn"
            onClick={onStart}
            disabled={status === 'running' || goal.trim().length === 0}
            type="button"
          >
            {status === 'running' ? `Running… step ${steps.length}` : '▶ Run agent'}
          </button>
        </section>

        {(steps.length > 0 || status !== 'idle') && (
          <section className="run-panel">
            <div className="run-header">
              <div>
                <span className={`status-pill status-${status}`}>{status}</span>
                {runId && <span className="run-id">run {runId}</span>}
                <span className="step-count">{steps.length} step{steps.length === 1 ? '' : 's'}</span>
              </div>
              {finalAnswer && (
                <div className="answer">
                  <span className="answer-label">Answer:</span>
                  <span className="answer-text">{finalAnswer}</span>
                </div>
              )}
              {errorMsg && <div className="error">{errorMsg}</div>}
            </div>

            <div className="viewer-grid">
              <div className="screenshot-frame">
                {latest && runId && (
                  <>
                    <img
                      src={screenshotUrl(runId, latest.screenshotPath)}
                      alt={`Step ${latest.step}`}
                      className="screenshot-img"
                    />
                    <div className="screenshot-label">
                      Step {latest.step} · {latest.url.slice(0, 60)}
                    </div>
                  </>
                )}
              </div>

              <aside className="history">
                <h3>Reasoning history</h3>
                <ol className="history-list">
                  {steps.slice().reverse().map((s) => (
                    <li key={s.step} className="history-item">
                      <div className="history-step">#{s.step}</div>
                      <div className="history-action-type">{s.action.type}</div>
                      <div className="history-reason">{s.reasoning}</div>
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <a href="https://dev48v.infy.uk" target="_blank" rel="noreferrer noopener">
          ← Back to dev48v.infy.uk
        </a>
        <span className="footer-sep">·</span>
        <a href="https://ai.google.dev" target="_blank" rel="noreferrer noopener">
          Powered by Gemini
        </a>
      </footer>
    </div>
  );
};
