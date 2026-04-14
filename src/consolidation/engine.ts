import { getDb, countSessionsSince, decayObservables } from '../storage/sqlite.js';
import { getMemoryDir } from '../storage/memory-md.js';

export const CONSOLIDATION_PROMPT = `
# Dream: Memory Consolidation

You are performing a dream — a reflective pass over your memory files.
Synthesize what you've learned recently into durable, well-organized memories
so that future sessions can orient quickly.

Memory directory: {memoryDir}
Project transcripts: via Opencode API

---

## Phase 1 — Orient

- Read MEMORY.md to understand current index
- List topic files to see what already exists
- Review recent observations in SQLite (last 24h)

## Phase 2 — Gather

Look for new information worth persisting:
1. Recent observations that haven't been consolidated yet
2. Existing memories that may have changed
3. Search transcripts for specific context if needed (use session.messages API)

## Phase 3 — Consolidate

For each thing worth remembering:
- Merge into existing topic files rather than creating duplicates
- Convert relative dates ("yesterday") to absolute dates
- Delete contradicted facts
- Update MEMORY.md index

## Phase 4 — Prune

- Keep MEMORY.md under 200 lines
- Remove pointers to stale/wrong memories
- Demote verbose entries to topic files

---

Return a JSON summary:
{
  "memoriesUpdated": [],
  "memoriesCreated": [],
  "memoriesDeleted": [],
  "indexUpdated": boolean
}
`;

export interface ConsolidationResult {
  memoriesUpdated: string[];
  memoriesCreated: string[];
  memoriesDeleted: string[];
  indexUpdated: boolean;
  decayResult?: { promoted: number; demoted: number; removed: number };
}

let currentLockPid: number | null = null;

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getProjectDir(): string {
  return process.cwd();
}

export async function getLastConsolidationTime(): Promise<number> {
  const db = await getDb();

  return new Promise((resolve) => {
    db.get('SELECT acquired_at FROM consolidation_lock WHERE id = 1', [], (err, row: any) => {
      if (err || !row) {
        resolve(0);
      } else {
        resolve(row.acquired_at ?? 0);
      }
    });
  });
}

export async function shouldConsolidate(project: string = getProjectDir()): Promise<boolean> {
  const lastRun = await getLastConsolidationTime();
  const hoursSince = (Date.now() - lastRun) / 3_600_000;

  if (hoursSince < 24) return false;

  const newSessionsCount = await countSessionsSince(project, lastRun);
  return newSessionsCount >= 5;
}

export async function tryAcquireLock(project: string = getProjectDir()): Promise<boolean> {
  const db = await getDb();

  return new Promise((resolve) => {
    db.get('SELECT * FROM consolidation_lock WHERE id = 1', [], (err, row: any) => {
      if (err) {
        resolve(false);
        return;
      }

      if (row) {
        const stale = Date.now() - row.acquired_at > 60 * 60 * 1000;
        const processAlive = isProcessRunning(row.pid);

        if (!stale && processAlive) {
          resolve(false);
          return;
        }
      }

      getLastConsolidationTime().then(lastRun => {
        countSessionsSince(project, lastRun).then(sessionsReviewed => {
          db.run(`
            INSERT OR REPLACE INTO consolidation_lock (id, pid, acquired_at, sessions_reviewed)
            VALUES (1, ?, ?, ?)
          `, [process.pid, Date.now(), sessionsReviewed], (runErr) => {
            if (runErr) {
              resolve(false);
            } else {
              currentLockPid = process.pid;
              resolve(true);
            }
          });
        });
      });
    });
  });
}

export async function releaseLock(): Promise<void> {
  if (!currentLockPid) return;
  const db = await getDb();

  return new Promise((resolve) => {
    db.run('DELETE FROM consolidation_lock WHERE id = 1 AND pid = ?', [currentLockPid], () => {
      currentLockPid = null;
      resolve();
    });
  });
}

export async function rollbackLock(): Promise<void> {
  const db = await getDb();

  return new Promise((resolve) => {
    db.run('DELETE FROM consolidation_lock WHERE id = 1', [], () => {
      currentLockPid = null;
      resolve();
    });
  });
}

export async function runConsolidation(project: string = getProjectDir()): Promise<ConsolidationResult | null> {
  if (!await shouldConsolidate(project)) return null;

  const acquired = await tryAcquireLock(project);
  if (!acquired) return null;

  try {
    const memoryDir = getMemoryDir();

    const prompt = CONSOLIDATION_PROMPT
      .replace('{memoryDir}', memoryDir)
      .replace('{projectDir}', project);

    console.log('[Consolidation] Running with prompt:', prompt.substring(0, 100) + '...');

    const decayResult = await decayObservables(project);
    console.log(`[Consolidation] Decay: ${decayResult.promoted} promoted, ${decayResult.demoted} demoted, ${decayResult.removed} removed`);

    return {
      memoriesUpdated: [],
      memoriesCreated: [],
      memoriesDeleted: [],
      indexUpdated: false,
      decayResult
    };
  } catch (e) {
    await rollbackLock();
    return null;
  }
}
