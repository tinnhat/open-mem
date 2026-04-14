import { getDb, searchFts, Observation } from '../storage/sqlite.js';
import { ObservationType } from '../taxonomy/types.js';

export interface SearchResult {
  id: number;
  type: ObservationType;
  title: string;
  createdAt: string;
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

  const results = await searchFts(query, { type, project, limit, offset });

  return results.map(row => ({
    id: row.id,
    type: row.type as ObservationType,
    title: row.title,
    createdAt: row.created_at
  }));
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
