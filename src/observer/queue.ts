import { QueuedObservation } from './types';
import { compressObservation } from '../compressor/ai.js';
import { insertObservation } from '../storage/sqlite.js';

const DEBOUNCE_MS = 1000;
const MAX_QUEUE_SIZE = 100;

export class ObservationQueue {
  private queue: QueuedObservation[] = [];
  private processing = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  enqueue(obs: Omit<QueuedObservation, 'id' | 'retryCount'>): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
    }

    const item: QueuedObservation = {
      ...obs,
      id: crypto.randomUUID(),
      retryCount: 0,
    };
    this.queue.push(item);
    this.resetDebounce();
  }

  private resetDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.processQueue();
    }, DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.queue.length > 0) {
      await this.processQueue();
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const items = this.queue.splice(0);

    for (const item of items) {
      await this.compressAndStore(item);
    }

    this.processing = false;
  }

  private async compressAndStore(item: QueuedObservation): Promise<void> {
    const maxRetries = 3;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const client = (global as any).opencodeClient;
        const result = await compressObservation(
          item.tool,
          item.input,
          item.output,
          item.sessionId,
          item.project,
          client
        );

        if (result !== null) {
          await insertObservation({
            session_id: result.sessionId,
            project: result.project,
            type: result.type,
            title: result.title,
            narrative: result.narrative,
            facts: result.facts,
            concepts: result.concepts,
            files_read: result.filesRead,
            files_modified: result.filesModified,
            prompt_number: result.promptNumber,
            quality_score: result.qualityScore,
          });
        }
        return;
      } catch (error) {
        lastError = error;
        item.retryCount = attempt + 1;
      }
    }

    console.error(`[session-memory-opencode] Failed to compressAndStore after ${maxRetries} retries:`, lastError);
  }
}

export const observationQueue = new ObservationQueue();
