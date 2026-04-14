export const OBSERVATION_TYPES = [
  'decision',
  'bugfix',
  'feature',
  'refactor',
  'discovery',
  'feedback',
  'reference'
] as const;

export type ObservationType = (typeof OBSERVATION_TYPES)[number];

export interface CompressedObservation {
  id?: number;
  sessionId: string;
  project: string;
  type: ObservationType;
  title: string;
  narrative?: string;
  facts: string[];
  concepts: string[];
  filesRead: string[];
  filesModified: string[];
  promptNumber: number;
  createdAt: string;
  createdAtEpoch: number;
  qualityScore?: number;
}

export interface SessionSummary {
  id?: number;
  sessionId: string;
  project: string;
  request: string;
  investigated: string;
  learned: string;
  completed: string;
  nextSteps: string;
  filesRead: string[];
  filesEdited: string[];
  notes: string;
  promptNumber: number;
  createdAt: string;
  createdAtEpoch: number;
}
