// Action JSON returned by Gemini each step. The model picks one of
// these primitives based on the screenshot + history. Kept small on
// purpose — fewer choices = better model accuracy.
export type AgentAction =
  | { type: 'click'; x: number; y: number; reason: string }
  | { type: 'type'; text: string; reason: string }
  | { type: 'press'; key: string; reason: string }
  | { type: 'scroll'; dy: number; reason: string }
  | { type: 'goto'; url: string; reason: string }
  | { type: 'wait'; ms: number; reason: string }
  | { type: 'done'; answer: string; reason: string };

// One row in the agent's history log — streamed live to the client.
export interface AgentStep {
  step: number;
  timestamp: number;
  screenshotPath: string;  // relative to runs/<runId>/
  reasoning: string;       // Gemini's plain-English explanation
  action: AgentAction;
  url: string;             // page URL at time of action
  title: string;
}

export interface RunMeta {
  id: string;
  goal: string;
  startedAt: number;
  finishedAt: number | null;
  status: 'running' | 'done' | 'failed';
  finalAnswer: string | null;
  error: string | null;
  steps: number;
}
