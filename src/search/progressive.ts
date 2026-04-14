import { getDb, searchFts, Observation, getTimeDecayScore } from '../storage/sqlite.js';
import { ObservationType } from '../taxonomy/types.js';
import { generateEmbedding, searchVectors, isVectorStoreAvailable, rrfMerge } from '../storage/vectors.js';

export interface SearchResult {
  id: number;
  type: ObservationType;
  title: string;
  createdAt: string;
  score?: number;
}

export async function search(
  query: string,
  options: {
    type?: ObservationType;
    project?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<SearchResult[]> {
  const { type, project, limit = 20, offset = 0 } = options;

  const ftsResults = await searchFts(query, { type, project, limit, offset });
  const ftsMapped = ftsResults.map((row, idx) => ({
    id: row.id,
    rank: idx,
    type: row.type as ObservationType,
    title: row.title,
    createdAt: row.created_at
  }));

  if (!isVectorStoreAvailable() || !query.trim()) {
    return ftsMapped;
  }

  try {
    const queryEmbedding = await generateEmbedding(query);
    const vecResults = await searchVectors(queryEmbedding, limit);

    if (vecResults.length === 0) {
      return ftsMapped;
    }

    const merged = rrfMerge(
      ftsMapped.map(r => ({ id: r.id })),
      vecResults
    );

    const mergedMap = new Map(merged.map(m => [m.id, m.score]));
    const ids = merged.map(m => m.id);

    const db = await getDb();
    const placeholders = ids.map(() => '?').join(',');
    const rows = await new Promise<any[]>((resolve) => {
      db.all(
        `SELECT id, type, title, created_at FROM observations WHERE id IN (${placeholders})`,
        ids,
        (err, result) => {
          if (err) resolve([]);
          else resolve(result);
        }
      );
    });

    return rows.map(row => ({
      id: row.id,
      type: row.type as ObservationType,
      title: row.title,
      createdAt: row.created_at,
      score: mergedMap.get(row.id) || 0,
    })).sort((a, b) => (b.score || 0) - (a.score || 0));

  } catch (e) {
    console.warn('[open-mem] Vector search failed, falling back to FTS:', e);
    return ftsMapped;
  }
}

export async function timeline(
  anchorId: number,
  options: {
    depthBefore?: number;
    depthAfter?: number;
    project?: string;
  } = {}
): Promise<any[]> {
  const { depthBefore = 3, depthAfter = 3, project } = options;
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.get(`SELECT id, created_at_epoch FROM observations WHERE id = ?`, [anchorId], (err, row: any) => {
      if (err || !row) {
        resolve([]);
        return;
      }

      const minEpoch = row.created_at_epoch - (depthBefore * 3600 * 1000);
      const maxEpoch = row.created_at_epoch + (depthAfter * 3600 * 1000);

      let sql = `SELECT * FROM observations WHERE created_at_epoch BETWEEN ? AND ?`;
      const params: any[] = [minEpoch, maxEpoch];

      if (project) {
        sql += ` AND project = ?`;
        params.push(project);
      }

      sql += ` ORDER BY created_at_epoch ASC`;

      db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('[open-mem] Timeline error:', err);
          resolve([]);
        } else {
          resolve(rows);
        }
      });
    });
  });
}

export async function getObservations(
  ids: number[],
  options: { project?: string } = {}
): Promise<any[]> {
  if (ids.length === 0) return [];

  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');

  let sql = `SELECT * FROM observations WHERE id IN (${placeholders})`;
  const params: any[] = [...ids];

  if (options.project) {
    sql += ` AND project = ?`;
    params.push(options.project);
  }

  sql += ` ORDER BY created_at_epoch DESC`;

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('[open-mem] Get observations error:', err);
        resolve([]);
      } else {
        resolve(rows);
      }
    });
  });
}

export async function searchWithTimeDecay(
  query: string,
  options: {
    type?: ObservationType;
    project?: string;
    limit?: number;
    offset?: number;
    hotOnly?: boolean;
  } = {}
): Promise<SearchResult[]> {
  const results = await search(query, options);

  if (options.hotOnly) {
    return results;
  }

  const scoredWithDecay = await Promise.all(
    results.map(async (r) => {
      const decayScore = await getTimeDecayScore(r.id);
      return {
        ...r,
        decayScore,
        combinedScore: (r.score || 0) * 0.7 + decayScore * 0.3,
      };
    })
  );

  return scoredWithDecay
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .map(({ decayScore, combinedScore, ...rest }) => rest as SearchResult);
}
