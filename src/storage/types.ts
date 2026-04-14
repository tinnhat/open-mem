export type SessionStatus = 'active' | 'completed' | 'failed';

export interface Session {
  id?: number;
  opencodeSessionId: string;
  project: string;
  startedAt: string;
  startedAtEpoch: number;
  completedAt?: string;
  completedAtEpoch?: number;
  status: SessionStatus;
}

export interface Observation {
  id?: number;
  sessionId: string;
  project: string;
  type: string;
  title: string;
  narrative?: string;
  facts?: string;
  concepts?: string;
  filesRead?: string;
  filesModified?: string;
  promptNumber?: number;
  discoveryTokens?: number;
  contentHash?: string;
  createdAt: string;
  createdAtEpoch: number;
}

export interface Summary {
  id?: number;
  sessionId: string;
  project: string;
  request?: string;
  investigated?: string;
  learned?: string;
  completed?: string;
  nextSteps?: string;
  filesRead?: string;
  filesEdited?: string;
  notes?: string;
  promptNumber?: number;
  discoveryTokens?: number;
  createdAt: string;
  createdAtEpoch: number;
}

export interface UserPrompt {
  id?: number;
  sessionId: string;
  promptText: string;
  promptNumber: number;
  createdAt: string;
  createdAtEpoch: number;
}
