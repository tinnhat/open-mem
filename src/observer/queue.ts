import { QueuedObservation } from './types';
import { compressObservation } from '../compressor/ai.js';
import { insertObservation } from '../storage/sqlite.js';

export class ObservationQueue {
  private queue: QueuedObservation[] = [];
  private processing = false;

  enqueue(obs: Omit<QueuedObservation, 'id' | 'retryCount'>): void {
    const item: QueuedObservation = {
      ...obs,
      id: crypto.randomUUID(),
      retryCount: 0,
    };
    this.queue.push(item);
    if (!this.processing) {
      this.processNext();
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const item = this.queue.shift()!;
    await this.compressAndStore(item);
    await this.processNext();
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

    console.error(`Failed to compressAndStore after ${maxRetries} retries:`, lastError);
  }
}

export const observationQueue = new ObservationQueue();
