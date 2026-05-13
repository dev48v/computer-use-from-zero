// STEP 4 — Gemini client. Asks the model: "given this screenshot
// + goal + history, what should I do next?"
//
// We use Gemini's structured-output mode (responseSchema) so we get
// a typed AgentAction back instead of having to regex-parse markdown.
// One source of brittleness eliminated.
//
// Why Gemini 2.5 Pro (not Flash)?
//   The spatial reasoning required to say "the search box is at
//   roughly (640, 100)" is much sharper on Pro. Flash often returns
//   plausible-looking coordinates that miss the target by 50px,
//   which on a click target = a wrong click. Pro's grounding scored
//   ~3x better in our tests.
import { GoogleGenerativeAI, SchemaType, type GenerativeModel } from '@google/generative-ai';
import { config } from './config.js';
import type { AgentAction, AgentStep } from './types.js';

const SYSTEM_PROMPT = `
You are a vision agent that operates a web browser to accomplish a user's goal.

You see ONE screenshot of the current browser window each turn (1280x800 viewport).
You decide ONE action to take next. Then you see the result and decide the next action.

Your action vocabulary (pick exactly one per turn):
- click {x, y, reason}      — left-click pixel coordinate (origin = top-left)
- type {text, reason}       — type text into currently focused field
- press {key, reason}       — press a key (Enter, Tab, Escape, ArrowDown, etc.)
- scroll {dy, reason}       — scroll viewport vertically (positive = down)
- goto {url, reason}        — navigate the browser directly to a URL
- wait {ms, reason}         — wait N milliseconds for the page to settle
- done {answer, reason}     — goal accomplished; return the final answer

Rules:
1. Be decisive. One action per turn. No multi-step reasoning chains.
2. Coordinates must be inside the 1280x800 viewport. Aim for the CENTER of click targets.
3. After typing into a search box, almost always press Enter next — don't try to click a "Search" button.
4. When you've found the answer, call "done" with a short factual answer string.
5. If the page hasn't loaded (loading spinner, blank), use wait { ms: 1500 }.
6. Reasoning should be one sentence, not an essay.
`.trim();

const actionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      enum: ['click', 'type', 'press', 'scroll', 'goto', 'wait', 'done'],
    },
    reason: { type: SchemaType.STRING, description: 'One-sentence why' },
    x: { type: SchemaType.NUMBER, description: 'X coord for click' },
    y: { type: SchemaType.NUMBER, description: 'Y coord for click' },
    text: { type: SchemaType.STRING, description: 'Text to type' },
    key: { type: SchemaType.STRING, description: 'Key name to press' },
    dy: { type: SchemaType.NUMBER, description: 'Scroll delta in px' },
    url: { type: SchemaType.STRING, description: 'URL to navigate to' },
    ms: { type: SchemaType.NUMBER, description: 'Milliseconds to wait' },
    answer: { type: SchemaType.STRING, description: 'Final answer when done' },
  },
  required: ['type', 'reason'],
};

let model: GenerativeModel | null = null;
const getModel = (): GenerativeModel => {
  if (!model) {
    const client = new GoogleGenerativeAI(config.geminiApiKey);
    model = client.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: actionSchema,
        // Low temperature → consistent action picks. The model still
        // has plenty of latitude in WHICH action to pick.
        temperature: 0.2,
      },
    });
  }
  return model;
};

// Free-tier RPM caps on Gemini are strict (Flash = 5 RPM, Flash-Lite
// = 15 RPM). Even a 2-step agent run can burst over the cap when
// fired back-to-back. We retry on 429 using the server-provided
// retryDelay (parsed from the error message), capped at 60s × 3 tries.
const parseRetryDelaySeconds = (errMsg: string): number => {
  // Error format: "Please retry in 34.321623881s." OR `"retryDelay":"34s"`.
  // Both are present in the same payload — we match either.
  const match = errMsg.match(/retry in ([\d.]+)s/i) ?? errMsg.match(/"retryDelay":"(\d+)s"/);
  if (!match) return 15;
  return Math.min(60, Math.ceil(Number(match[1])));
};

const isRateLimit = (err: unknown): boolean => {
  const msg = (err as Error)?.message ?? '';
  return msg.includes('429') || msg.toLowerCase().includes('quota');
};

export const planNextAction = async (
  goal: string,
  history: AgentStep[],
  screenshotBase64: string,
  pageUrl: string,
): Promise<AgentAction> => {
  // We compress history into a short text summary instead of sending
  // every prior screenshot. That keeps token costs flat across long
  // runs — past screenshots add noise more than signal.
  const historySummary = history.length === 0
    ? '(none yet — this is the first step)'
    : history
        .slice(-8)
        .map(
          (h) =>
            `Step ${h.step}: ${h.action.type}${'reason' in h.action ? ` — ${h.action.reason}` : ''} @ ${h.url}`,
        )
        .join('\n');

  const prompt = `Goal: ${goal}

Current page: ${pageUrl}

Recent steps:
${historySummary}

What is the next single action?`;

  const parts = [
    { text: prompt },
    { inlineData: { mimeType: 'image/png', data: screenshotBase64 } },
  ];

  // Up to 3 attempts. On 429, wait the server-suggested retryDelay.
  // Anything else (5xx, network) re-throws on the first failure since
  // those signal real problems and the agent loop should fail fast.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await getModel().generateContent(parts);
      const text = result.response.text();
      return JSON.parse(text) as AgentAction;
    } catch (err) {
      lastError = err;
      if (!isRateLimit(err)) throw err;
      const delaySec = parseRetryDelaySeconds((err as Error).message);
      console.warn(`[gemini] 429 rate-limited, retrying in ${delaySec}s (attempt ${attempt + 1}/3)`);
      await new Promise((r) => setTimeout(r, delaySec * 1000));
    }
  }
  throw lastError;
};
