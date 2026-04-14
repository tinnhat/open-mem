import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { load as loadVecExtension } from 'sqlite-vec';

const MEMORY_DIR = path.join(os.homedir(), '.config', 'opencode', 'memory');
const DB_PATH = path.join(MEMORY_DIR, 'memory.db');
const VEC_EXTENSION_LOADED = Symbol('vecExtensionLoaded');

export function generateContentHash(content: {
  type: string;
  title: string;
  narrative?: string;
  facts?: string[];
  files_read?: string[];
  files_modified?: string[];
}): string {
  const normalized = JSON.stringify({
    t: content.type,
    ti: content.title.toLowerCase().trim(),
    n: content.narrative?.toLowerCase().trim(),
    f: content.facts?.map(f => f.toLowerCase().trim()).sort(),
    fr: content.files_read?.map(f => f.toLowerCase().trim()).sort(),
    fm: content.files_modified?.map(f => f.toLowerCase().trim()).sort(),
  });
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export async function findExistingObservation(hash: string, project: string): Promise<number | null> {
  const database = await getDb();
  const escapedHash = hash.replace(/'/g, "''");
  const escapedProject = project.replace(/'/g, "''");

  return new Promise((resolve) => {
    database.get(
      `SELECT id FROM observations WHERE content_hash = '${escapedHash}' AND project = '${escapedProject}' LIMIT 1`,
      (err, row: any) => {
        if (err) {
          console.error('[open-mem] Find existing observation error:', err);
          resolve(null);
        } else {
          resolve(row?.id ?? null);
        }
      }
    );
  });
}

let db: sqlite3.Database | null = null;

function ensureDb(): sqlite3.Database {
  if (db) return db;

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new sqlite3.Database(DB_PATH);
  return db;
}

let vecExtLoaded = false;

async function ensureVecExtension(database: sqlite3.Database): Promise<void> {
  if (vecExtLoaded) return;
  try {
    const extPath = await import('sqlite-vec').then(m => m.getLoadablePath());
    (database as any).loadExtension(extPath);
    vecExtLoaded = true;
  } catch (e) {
    console.warn('[open-mem] Failed to load vec extension:', e);
  }
}

export async function getDb(): Promise<sqlite3.Database> {
  return new Promise((resolve) => {
    const database = ensureDb();
    resolve(database);
  });
}

export async function initDatabase(): Promise<void> {
  const database = await getDb();
  await ensureVecExtension(database);

  return new Promise((resolve, reject) => {
    database.serialize(() => {
      database.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          opencode_session_id TEXT UNIQUE NOT NULL,
          project TEXT NOT NULL,
          started_at TEXT NOT NULL,
          started_at_epoch INTEGER NOT NULL,
          completed_at TEXT,
          completed_at_epoch INTEGER,
          status TEXT CHECK(status IN ('active', 'completed', 'failed')) DEFAULT 'active'
        )
      `);

      database.run(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at)`);

      database.run(`
        CREATE TABLE IF NOT EXISTS observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          project TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN (
            'decision', 'bugfix', 'feature', 'refactor', 'discovery', 'feedback', 'reference'
          )),
          title TEXT NOT NULL,
          narrative TEXT,
          facts TEXT,
          concepts TEXT,
          files_read TEXT,
          files_modified TEXT,
          prompt_number INTEGER,
          discovery_tokens INTEGER DEFAULT 0,
          content_hash TEXT,
          created_at TEXT NOT NULL,
          created_at_epoch INTEGER NOT NULL
        )
      `);

      database.run(`CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_observations_title ON observations(title)`);

      database.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
          title,
          narrative,
          facts,
          content='observations',
          content_rowid='id',
          tokenize='porter unicode61'
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          project TEXT NOT NULL,
          request TEXT,
          investigated TEXT,
          learned TEXT,
          completed TEXT,
          next_steps TEXT,
          files_read TEXT,
          files_edited TEXT,
          notes TEXT,
          prompt_number INTEGER,
          discovery_tokens INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          created_at_epoch INTEGER NOT NULL
        )
      `);

      database.run(`CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_summaries_project ON summaries(project)`);

      database.run(`
        CREATE TABLE IF NOT EXISTS user_prompts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          prompt_text TEXT NOT NULL,
          prompt_number INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          created_at_epoch INTEGER NOT NULL
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS consolidation_lock (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          pid INTEGER,
          acquired_at INTEGER,
          sessions_reviewed INTEGER DEFAULT 0
        )
      `);

      database.run(`
        CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
          INSERT INTO observations_fts(rowid, title, narrative, facts)
          VALUES (new.id, new.title, new.narrative, new.facts);
        END
      `);

      database.run(`
        CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
          INSERT INTO observations_fts(observations_fts, rowid, title, narrative, facts)
          VALUES ('delete', old.id, old.title, old.narrative, old.facts);
        END
      `);

      database.run(`
        CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
          INSERT INTO observations_fts(observations_fts, rowid, title, narrative, facts)
          VALUES ('delete', old.id, old.title, old.narrative, old.facts);
          INSERT INTO observations_fts(rowid, title, narrative, facts)
          VALUES (new.id, new.title, new.narrative, new.facts);
        END
      `);

      database.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS observations_vec USING vec0(
          observation_id INTEGER,
          embedding FLOAT[768]
        )
      `);

      resolve();
    });
  });
}

export interface Observation {
  session_id: string;
  project: string;
  type: 'decision' | 'bugfix' | 'feature' | 'refactor' | 'discovery' | 'feedback' | 'reference';
  title: string;
  narrative?: string;
  facts?: string[];
  concepts?: string[];
  files_read?: string[];
  files_modified?: string[];
  prompt_number?: number;
  discovery_tokens?: number;
  content_hash?: string;
}

export interface Summary {
  session_id: string;
  project: string;
  request?: string;
  investigated?: string;
  learned?: string;
  completed?: string;
  next_steps?: string;
  files_read?: string;
  files_edited?: string;
  notes?: string;
  prompt_number?: number;
  discovery_tokens?: number;
}

export async function insertUserPrompt(
  sessionId: string,
  promptText: string,
  promptNumber: number
): Promise<number> {
  const database = await getDb();
  const now = new Date().toISOString();
  const nowEpoch = Date.now();

  return new Promise((resolve, reject) => {
    database.run(`
      INSERT INTO user_prompts (
        session_id, prompt_text, prompt_number, created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?)
    `, [sessionId, promptText, promptNumber, now, nowEpoch], function(err) {
      if (err) {
        console.error('[open-mem] Insert user prompt error:', err);
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

export async function insertObservation(obs: Observation): Promise<{ id: number; deduplicated: boolean; originalId?: number }> {
  const contentHash = obs.content_hash || generateContentHash({
    type: obs.type,
    title: obs.title,
    narrative: obs.narrative,
    facts: obs.facts,
    files_read: obs.files_read,
    files_modified: obs.files_modified,
  });

  const existingId = await findExistingObservation(contentHash, obs.project);
  if (existingId !== null) {
    console.log(`[open-mem] Deduplicated observation (hash: ${contentHash}, existing ID: ${existingId})`);
    return { id: existingId, deduplicated: true, originalId: existingId };
  }

  const database = await getDb();
  const now = new Date().toISOString();
  const nowEpoch = Date.now();

  return new Promise((resolve, reject) => {
    database.run(`
      INSERT INTO observations (
        session_id, project, type, title, narrative, facts, concepts,
        files_read, files_modified, prompt_number, discovery_tokens,
        content_hash, created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      obs.session_id,
      obs.project,
      obs.type,
      obs.title,
      obs.narrative ?? null,
      obs.facts ? JSON.stringify(obs.facts) : null,
      obs.concepts ? JSON.stringify(obs.concepts) : null,
      obs.files_read ? JSON.stringify(obs.files_read) : null,
      obs.files_modified ? JSON.stringify(obs.files_modified) : null,
      obs.prompt_number ?? null,
      obs.discovery_tokens ?? 0,
      contentHash,
      now,
      nowEpoch,
    ], function(err) {
      if (err) {
        console.error('[open-mem] Insert observation error:', err);
        reject(err);
      } else {
        resolve({ id: this.lastID, deduplicated: false });
      }
    });
  });
}

export async function insertSummary(summary: Summary): Promise<number> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const nowEpoch = Date.now();

    database.run(`
      INSERT INTO summaries (
        session_id, project, request, investigated, learned, completed,
        next_steps, files_read, files_edited, notes, prompt_number,
        discovery_tokens, created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      summary.session_id,
      summary.project,
      summary.request ?? null,
      summary.investigated ?? null,
      summary.learned ?? null,
      summary.completed ?? null,
      summary.next_steps ?? null,
      summary.files_read ?? null,
      summary.files_edited ?? null,
      summary.notes ?? null,
      summary.prompt_number ?? null,
      summary.discovery_tokens ?? 0,
      now,
      nowEpoch,
    ], function(err) {
      if (err) {
        console.error('[open-mem] Insert summary error:', err);
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

export async function searchFts(
  query: string,
  options: {
    type?: Observation['type'];
    project?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ id: number; type: string; title: string; created_at: string }[]> {
  const database = await getDb();
  const { type, project, limit = 20, offset = 0 } = options;

  if (!query || query.trim() === '') {
    return searchWithoutFts(options);
  }

  const ftsQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map(term => `"${term.replace(/"/g, '""')}"`)
    .join(' OR ');

  let sql = `
    SELECT o.id, o.type, o.title, o.created_at
    FROM observations o
    JOIN observations_fts fts ON o.id = fts.rowid
    WHERE observations_fts MATCH '${ftsQuery}'
  `;

  if (type) {
    sql += ` AND o.type = '${type}'`;
  }

  if (project) {
    sql += ` AND o.project = '${project.replace(/'/g, "''")}'`;
  }

  sql += ` ORDER BY rank LIMIT ${limit} OFFSET ${offset}`;

  return new Promise((resolve, reject) => {
    database.all(sql, (err, rows) => {
      if (err) {
        console.error('[open-mem] FTS search error:', err);
        resolve([]);
      } else {
        resolve(rows as { id: number; type: string; title: string; created_at: string }[]);
      }
    });
  });
}

async function searchWithoutFts(
  options: {
    type?: Observation['type'];
    project?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ id: number; type: string; title: string; created_at: string }[]> {
  const database = await getDb();
  const { type, project, limit = 20, offset = 0 } = options;

  let sql = `SELECT id, type, title, created_at FROM observations WHERE 1=1`;

  if (type) {
    sql += ` AND type = '${type}'`;
  }

  if (project) {
    sql += ` AND project = '${project.replace(/'/g, "''")}'`;
  }

  sql += ` ORDER BY created_at_epoch DESC LIMIT ${limit} OFFSET ${offset}`;

  return new Promise((resolve, reject) => {
    database.all(sql, (err, rows) => {
      if (err) {
        console.error('[open-mem] Search error:', err);
        resolve([]);
      } else {
        resolve(rows as { id: number; type: string; title: string; created_at: string }[]);
      }
    });
  });
}

export async function getRecentObservations(project: string, limit = 50): Promise<any[]> {
  const database = await getDb();
  const escaped = project.replace(/'/g, "''");

  return new Promise((resolve, reject) => {
    database.all(`
      SELECT * FROM observations
      WHERE project = '${escaped}'
      ORDER BY created_at_epoch DESC
      LIMIT ${limit}
    `, (err, rows) => {
      if (err) {
        console.error('[open-mem] Get recent observations error:', err);
        resolve([]);
      } else {
        resolve(rows);
      }
    });
  });
}

export async function getRecentByProject(project: string, days: number): Promise<Observation[]> {
  const sinceEpoch = Date.now() - days * 24 * 60 * 60 * 1000;
  const database = await getDb();
  const escaped = project.replace(/'/g, "''");

  return new Promise((resolve, reject) => {
    database.all(`
      SELECT * FROM observations
      WHERE project = '${escaped}' AND created_at_epoch >= ${sinceEpoch}
      ORDER BY created_at_epoch DESC
    `, (err, rows: any[]) => {
      if (err) {
        console.error('[open-mem] Get recent by project error:', err);
        resolve([]);
      } else {
        resolve(rows.map(row => ({
          ...row,
          facts: row.facts ? JSON.parse(row.facts) : undefined,
          concepts: row.concepts ? JSON.parse(row.concepts) : undefined,
          files_read: row.files_read ? JSON.parse(row.files_read) : undefined,
          files_modified: row.files_modified ? JSON.parse(row.files_modified) : undefined,
        })));
      }
    });
  });
}

export async function getSessionSummary(sessionId: string): Promise<any | null> {
  const database = await getDb();
  const escaped = sessionId.replace(/'/g, "''");

  return new Promise((resolve, reject) => {
    database.get(`
      SELECT * FROM summaries
      WHERE session_id = '${escaped}'
      ORDER BY created_at_epoch DESC
      LIMIT 1
    `, (err, row) => {
      if (err) {
        console.error('[open-mem] Get session summary error:', err);
        resolve(null);
      } else {
        resolve(row || null);
      }
    });
  });
}

export async function getSessionsSince(project: string, sinceEpoch: number): Promise<any[]> {
  const database = await getDb();
  const escaped = project.replace(/'/g, "''");

  return new Promise((resolve, reject) => {
    database.all(`
      SELECT * FROM sessions
      WHERE project = '${escaped}' AND started_at_epoch >= ${sinceEpoch}
      ORDER BY started_at_epoch DESC
    `, (err, rows) => {
      if (err) {
        console.error('[open-mem] Get sessions since error:', err);
        resolve([]);
      } else {
        resolve(rows);
      }
    });
  });
}

export async function countSessionsSince(project: string, sinceEpoch: number): Promise<number> {
  const database = await getDb();
  const escaped = project.replace(/'/g, "''");

  return new Promise((resolve, reject) => {
    database.get(`
      SELECT COUNT(*) as count FROM sessions
      WHERE project = '${escaped}' AND started_at_epoch >= ${sinceEpoch}
    `, (err, row: any) => {
      if (err) {
        console.error('[open-mem] Count sessions since error:', err);
        resolve(0);
      } else {
        resolve(row?.count ?? 0);
      }
    });
  });
}

export async function closeDb(): Promise<void> {
  if (db) {
    return new Promise((resolve) => {
      db!.close(() => {
        db = null;
        resolve();
      });
    });
  }
}

export async function getObservationById(id: number): Promise<any | null> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    database.get(`SELECT * FROM observations WHERE id = ?`, [id], (err, row) => {
      if (err) {
        console.error('[open-mem] Get observation by ID error:', err);
        resolve(null);
      } else {
        resolve(row || null);
      }
    });
  });
}

export async function getObservationsByIds(ids: number[]): Promise<any[]> {
  if (ids.length === 0) return [];

  const database = await getDb();
  const placeholders = ids.map(() => '?').join(',');

  return new Promise((resolve, reject) => {
    database.all(
      `SELECT * FROM observations WHERE id IN (${placeholders})`,
      ids,
      (err, rows) => {
        if (err) {
          console.error('[open-mem] Get observations by IDs error:', err);
          resolve([]);
        } else {
          resolve(rows);
        }
      }
    );
  });
}
