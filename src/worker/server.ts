import express from 'express';
import { getDb } from '../storage/sqlite.js';
import { search, timeline, getObservations } from '../search/progressive.js';

const app = express();
const PORT = 37778;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/search', async (req, res) => {
  const { q, type, project, limit, offset } = req.query;
  try {
    const results = await search(q as string, {
      type: type as any,
      project: project as string,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/timeline', async (req, res) => {
  const { anchorId, depthBefore, depthAfter, project } = req.query;
  try {
    const results = await timeline(Number(anchorId), {
      depthBefore: depthBefore ? Number(depthBefore) : undefined,
      depthAfter: depthAfter ? Number(depthAfter) : undefined,
      project: project as string,
    });
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/observations/batch', async (req, res) => {
  const { ids, project } = req.body;
  try {
    const results = await getObservations(ids, { project });
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/summaries/recent', async (req, res) => {
  const { project, limit } = req.query;
  if (!project) {
    res.status(400).json({ error: 'project is required' });
    return;
  }
  try {
    const db = await getDb();
    const sql = `
      SELECT * FROM summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `;
    
    db.all(sql, [project as string, limit ? Number(limit) : 50], (err, rows) => {
      if (err) {
        res.status(500).json({ error: String(err) });
      } else {
        res.json(rows);
      }
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/observations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    
    db.get(`SELECT * FROM observations WHERE id = ?`, [Number(id)], (err, row) => {
      if (err) {
        res.status(500).json({ error: String(err) });
      } else if (!row) {
        res.status(404).json({ error: 'Observation not found' });
      } else {
        res.json(row);
      }
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/sessions/:id/observations', async (req, res) => {
  const { id } = req.params;
  const { limit } = req.query;
  try {
    const db = await getDb();
    const sql = `
      SELECT * FROM observations
      WHERE session_id = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `;
    
    db.all(sql, [id, limit ? Number(limit) : 50], (err, rows) => {
      if (err) {
        res.status(500).json({ error: String(err) });
      } else {
        res.json(rows);
      }
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export function startServer(): Promise<void> {
  return new Promise((resolve) => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      resolve();
    });
  });
}

export default app;
