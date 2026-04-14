import { QueuedObservation } from './types';

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
