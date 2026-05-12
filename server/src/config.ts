// STEP 2 — Centralised env. Fail fast on boot if anything is missing.
const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 8080),
  // Gemini API key from https://aistudio.google.com/apikey. Free tier
  // is generous (15 req/min, 1M req/day) and supports vision input —
  // the critical capability for a screenshot-driven agent.
  geminiApiKey: required('GEMINI_API_KEY'),
  // gemini-2.5-pro = strongest reasoning + multimodal. We do NOT
  // use Flash here because the agent's spatial reasoning ("click the
  // search box near the top") needs Pro's grounding accuracy.
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-pro',
  // Default starting URL the browser opens before a run begins.
  startUrl: process.env.START_URL ?? 'https://www.google.com',
  // Hard cap on agent iterations. Each iteration burns ~1 API call +
  // 1 screenshot. 30 is plenty for most "find X, click Y" goals.
  maxSteps: Number(process.env.MAX_STEPS ?? 30),
  // Viewport for the headless browser. 1280×800 matches what most
  // users see — keeps prompts in distribution.
  viewportWidth: Number(process.env.VIEWPORT_WIDTH ?? 1280),
  viewportHeight: Number(process.env.VIEWPORT_HEIGHT ?? 800),
  // CORS: empty array = allow any origin (dev). Production sets
  // CORS_ORIGINS=https://your-frontend.vercel.app.
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
