export interface QueuedObservation {
  id: string;
  tool: string;
  input: unknown;
  output: unknown;
  sessionId: string;
  project: string;
  timestamp: number;
  retryCount: number;
}

export const HIGH_VALUE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'NotebookEdit',
  'WebSearch',
  'WebFetch'
] as const;

export function isHighValueTool(tool: string): boolean {
  return HIGH_VALUE_TOOLS.includes(tool as (typeof HIGH_VALUE_TOOLS)[number]);
}
