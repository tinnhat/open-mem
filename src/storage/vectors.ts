import path from 'path';
import os from 'os';
import fs from 'fs';

interface VectorConfig {
  provider: 'ollama';
  model: 'snowflake-arctic-embed';
  endpoint: 'http://localhost:11434';
}

const config: VectorConfig = {
  provider: 'ollama',
  model: 'snowflake-arctic-embed',
  endpoint: 'http://localhost:11434',
};

let vecAvailable = false;

export async function initVectorStore(): Promise<void> {
  try {
    const response = await fetch(`${config.endpoint}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const data = await response.json() as { models?: { name: string }[] };
      const hasModel = data.models?.some(m => m.name === config.model);
      vecAvailable = hasModel ?? false;
      if (vecAvailable) {
        console.log('[open-mem] Vector store initialized with Ollama:', config.model);
      } else {
        console.log('[open-mem] Ollama available but model not found:', config.model);
      }
    }
  } catch {
    vecAvailable = false;
    console.log('[open-mem] Ollama not available, vector search disabled');
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!vecAvailable) {
    throw new Error('Vector store not available');
  }

  const response = await fetch(`${config.endpoint}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding generation failed: ${response.statusText}`);
  }

  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

export async function storeEmbedding(obsId: number, embedding: number[]): Promise<void> {
  const db = await getDb();
  const embeddingStr = JSON.stringify(embedding);

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO observations_vec (observation_id, embedding) VALUES (?, ?)`,
      [obsId, embeddingStr],
      (err: Error | null) => {
        if (err) {
          console.error('[open-mem] Store embedding error:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

export async function searchVectors(
  queryEmbedding: number[],
  limit: number
): Promise<{ id: number; distance: number }[]> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.all(
      `SELECT observation_id, distance FROM observations_vec
       WHERE embedding MATCH ? ORDER BY distance LIMIT ?`,
      [JSON.stringify(queryEmbedding), limit],
      (err: Error | null, rows: any[]) => {
        if (err) {
          console.error('[open-mem] Vector search error:', err);
          resolve([]);
        } else {
          resolve(rows.map(r => ({ id: r.observation_id, distance: r.distance })));
        }
      }
    );
  });
}

let db: any = null;
let extensionLoaded = false;

async function getDb(): Promise<any> {
  if (db) return db;

  const sqlite3 = await import('sqlite3');
  const sqliteVec = await import('sqlite-vec');

  const dbPath = path.join(os.homedir(), '.config', 'opencode', 'memory', 'memory.db');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new sqlite3.default.Database(dbPath);

  if (!extensionLoaded) {
    sqliteVec.load(db);
    extensionLoaded = true;
  }

  return db;
}

export function isVectorStoreAvailable(): boolean {
  return vecAvailable;
}

export function rrfMerge(
  ftsResults: { id: number; rank?: number }[],
  vecResults: { id: number; distance: number }[],
  k = 60
): { id: number; score: number }[] {
  const scores = new Map<number, number>();

  ftsResults.forEach((result, idx) => {
    const id = result.id;
    const score = 1 / (k + idx + 1);
    scores.set(id, (scores.get(id) || 0) + score);
  });

  vecResults.forEach((result, idx) => {
    const id = result.id;
    const score = 1 / (k + idx + 1);
    scores.set(id, (scores.get(id) || 0) + score);
  });

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}