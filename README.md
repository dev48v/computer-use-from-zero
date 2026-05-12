# Computer Use From Zero — Vision Agent

Day 33 of TechFromZero. A real vision agent that operates Chrome by reading screenshots, deciding actions, and clicking through pages — powered by **Google Gemini 2.5 Pro** and **Playwright**.

This is a *learn-by-doing* implementation of the perception → planning → action loop that powers every "agent that uses a computer" demo you've seen. Every file is heavily commented for beginners.

---

## What it does

You give the agent a goal in plain English ("Find the current price of AAPL stock on Google Finance"). It:

1. Opens a headless Chrome window.
2. Takes a screenshot.
3. Sends the screenshot + your goal + recent history to Gemini.
4. Gemini returns a single typed action: click, type, press, scroll, goto, wait, or done.
5. Playwright executes the action.
6. Repeat from step 2 until the model decides it's done — or it hits the step cap.

You watch the whole thing live in your browser: the latest screenshot on the left, the reasoning history on the right, the final answer at the top.

---

## Quick start

You need Docker.

```bash
git clone https://github.com/dev48v/computer-use-from-zero
cd computer-use-from-zero

# 1. Get a free Gemini API key
#    https://aistudio.google.com/apikey
echo "GEMINI_API_KEY=AIza...your-key..." > server/.env

# 2. Start the agent backend
docker compose up -d
# (first run downloads Playwright's Chromium image — ~280 MB)

# 3. Run the React client
npm install --workspace=client
npm run dev:client
# open http://localhost:5173
```

---

## What's in here

```
computer-use-from-zero/
├── server/                Node 22 + TypeScript + Express + Gemini + Playwright
│   └── src/
│       ├── config.ts        env loading + model defaults
│       ├── types.ts         AgentAction + AgentStep + RunMeta
│       ├── browser.ts       Playwright launch + screenshot helpers
│       ├── gemini.ts        plan-next-action via Gemini 2.5 Pro vision
│       ├── executor.ts      AgentAction → Playwright call mapping
│       ├── agent.ts         the loop (screenshot → plan → execute → record)
│       ├── routes/runs.ts   POST/GET /api/runs + SSE /stream + screenshot serving
│       └── index.ts         Express bootstrap
├── client/                Vite + React 19
│   └── src/
│       ├── App.tsx          goal input + live viewer + reasoning sidebar
│       └── api.ts           typed fetch + EventSource SSE subscriber
├── Dockerfile             single-stage on official Playwright image
└── render.yaml            Render Blueprint
```

---

## Step-by-step build

Each commit on `main` is one self-contained concept:

1. **Monorepo skeleton** — workspaces + gitignore
2. **Server scaffold** — Express + TypeScript + env config
3. **Browser adapter** — Playwright wrapper with no-sandbox flags
4. **Gemini client** — vision call + structured JSON output schema
5. **Action executor** — AgentAction → Playwright call mapping
6. **Agent loop** — screenshot → plan → execute → record
7. **HTTP + SSE routes** — start run, list runs, stream events
8. **Express bootstrap** — healthz + CORS + error handler
9. **Vite + React client** — goal input + EventSource subscriber
10. **Live viewer UI** — latest screenshot + reasoning sidebar
11. **Docker + Blueprint** — Playwright base image + Render
12. **README** — this file

---

## API reference

| Endpoint | What it does |
|----------|--------------|
| `POST /api/runs` | Body `{goal}`. Starts a run, returns `{id}`. |
| `GET /api/runs` | Returns the run list with status + step counts. |
| `GET /api/runs/:id` | One run's meta + full step history. |
| `GET /api/runs/:id/stream` | SSE stream — `step`, `done`, `error` events. |
| `GET /api/runs/:id/screenshots/:name.png` | Serves a stored screenshot. |
| `GET /healthz` | Liveness probe. |

---

## How the agent loop works (the concept this day teaches)

```
loop:
  screenshot = browser.screenshot()
  action     = gemini.plan(goal, history, screenshot)   ← vision model picks ONE action
  browser.execute(action)
  history.append(step)
  if action.type == 'done': break
```

That's the whole core idea. The cleverness is in:

- **Structured output**: Gemini returns JSON matching a strict schema, so we don't have to regex-parse markdown. One source of brittleness gone.
- **Small action vocabulary**: only 7 primitives (click, type, press, scroll, goto, wait, done). Fewer choices → better model accuracy.
- **Compressed history**: we send a 1-line summary of past steps (not past screenshots). Token costs stay flat across long runs.
- **SSE streaming**: the client watches each step land instead of polling.

---

## Why these choices

- **Gemini 2.5 Pro (not Flash)** — spatial reasoning on Pro is ~3× more accurate for click coordinates. Flash returns plausible-looking coords that miss by 50 px.
- **`responseSchema` not free-form** — typed JSON output eliminates parse failures and prompt-injection-via-bad-output.
- **No history of screenshots** — only the LATEST screenshot is sent each turn. Older screenshots are noise, and token costs would balloon on long runs.
- **`--no-sandbox` + `--disable-dev-shm-usage`** — Render's unprivileged container can't set up Chrome's user namespaces, and `/dev/shm` is too small. Standard headless-Chrome-in-Docker workarounds.
- **SSE, not WebSocket** — agent only pushes one direction (server → client). SSE works through every reverse proxy and corporate firewall; WebSocket Upgrade headers sometimes get stripped.

---

## Deployment

**Frontend** → Vercel. `VITE_API_URL` env points at Render backend.

**Backend** → Render free Docker. Single service, Playwright base image. Memory peak is ~450 MB; the 512 MB free tier handles small runs but can OOM on memory-heavy pages (Gmail, YouTube). If you hit OOMs, upgrade to Render Starter ($7/mo, 1 GB RAM) — the code is identical.

`GEMINI_API_KEY` is the only secret. Set it via the Render dashboard env var panel, NOT via `render.yaml` (which is in git).

---

## What you'll learn reading this

- The screenshot → LLM → action loop that powers every "agent uses a computer" demo
- Structured-output mode (`responseSchema`) for typed, parse-free LLM responses
- How to send images to Gemini via `inlineData` with base64
- Server-Sent Events for one-way live streaming (no WebSocket needed)
- Playwright headless Chrome inside Docker — flags, sandbox tradeoffs, memory pitfalls
- An LLM action-vocabulary design that maximises accuracy (small, decisive primitives)
