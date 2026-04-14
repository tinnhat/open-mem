import { countSessionsSince } from '../storage/sqlite.js';
import { shouldConsolidate, runConsolidation as runConsolidationEngine } from './engine.js';

const CONSOLIDATION_INTERVAL_HOURS = 24;
const MIN_SESSIONS = 5;

export async function checkConsolidation(): Promise<void> {
  const project = process.cwd();
  const sinceEpoch = Date.now() - CONSOLIDATION_INTERVAL_HOURS * 3600 * 1000;
  const sessionCount = await countSessionsSince(project, sinceEpoch);

  if (sessionCount >= MIN_SESSIONS) {
    await runConsolidationEngine(project);
  }
}

export async function markSessionComplete(sessionId: string): Promise<void> {
  const { getDb } = await import('../storage/sqlite.js');
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(`
    UPDATE sessions SET status = 'completed', completed_at = ?, completed_at_epoch = ?
    WHERE opencode_session_id = ?
  `, [now, Date.now(), sessionId]);
}