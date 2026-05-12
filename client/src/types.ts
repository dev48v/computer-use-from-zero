export type AgentAction =
  | { type: 'click'; x: number; y: number; reason: string }
  | { type: 'type'; text: string; reason: string }
  | { type: 'press'; key: string; reason: string }
  | { type: 'scroll'; dy: number; reason: string }
  | { type: 'goto'; url: string; reason: string }
  | { type: 'wait'; ms: number; reason: string }
  | { type: 'done'; answer: string; reason: string };

export interface AgentStep {
  step: number;
  timestamp: number;
  screenshotPath: string;
  reasoning: string;
  action: AgentAction;
  url: string;
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
