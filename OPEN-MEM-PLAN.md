# OPEN-MEM: Persistent Memory System for Opencode

**Version:** 1.0  
**Date:** 2026-04-13  
**Status:** Ready for Implementation

---

## MỤC LỤC

1. [Tổng quan](#1-tổng-quan)
2. [Research Sources](#2-research-sources)
3. [Architecture](#3-architecture)
4. [File Structure](#4-file-structure)
5. [Components chi tiết](#5-components-chi-tiết)
6. [Data Model](#6-data-model)
7. [AI Compression](#7-ai-compression)
8. [Search System](#8-search-system)
9. [Consolidation Engine](#9-consolidation-engine)
10. [Context Injection](#10-context-injection)
11. [Privacy & Taxonomy](#11-privacy--taxonomy)
12. [Transcripts](#12-transcripts)
13. [Installation](#13-installation)
14. [Usage](#14-usage)
15. [So sánh với Claude-Mem](#15-so-sánh-với-claude-mem)
16. [Implementation Phases](#16-implementation-phases)

---

## 1. TỔNG QUAN

**open-mem** là persistent memory system cho Opencode, tự động ghi lại mọi hoạt động coding, compress bằng AI, và inject context vào các session mới.

**Core Features:**
- Automatic capture (không cần user prompt)
- AI compression thành structured memories
- SQLite + FTS5 cho fast search
- MEMORY.md export (Claude Code compatible)
- 4-phase consolidation (autoDream-style)
- Privacy tags support
- Extended memory taxonomy
- Transcript search

---

## 2. RESEARCH SOURCES

### Claude-Mem (https://github.com/thedotmack/claude-mem)
- Hooks system: SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd
- SQLite + Chroma hybrid database
- Worker service (22 HTTP endpoints, port 37777)
- 3-layer progressive disclosure (search → timeline → get)
- AI compression via Claude Agent SDK

### Claude Code Leaked Source (https://github.com/yasasbanukaofficial/claude-code)
- autoDream system: 4-phase consolidation (Orient → Gather → Consolidate → Prune)
- MEMORY.md format: entrypoint + topic files with frontmatter
- Lock file mechanism cho concurrent consolidation prevention
- Type taxonomy: user, feedback, project, reference
- Consolidation gates: 24h AND 5 sessions minimum

### Opencode Docs (https://opencode.ai/docs)
- Plugin system: Event-based (session.created, tool.execute.after, etc.)
- SDK: `client.session.prompt()` cho AI calls
- Skills system: SKILL.md files
- Server API: session.messages() endpoint (no JSONL transcript files)
- MCP servers support

---

## 3. ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           open-mem                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐│
│  │   Plugin     │────▶│   Observer   │────▶│   AI Compressor           ││
│  │   Events     │     │   Queue      │     │   (Opencode SDK)          ││
│  └──────────────┘     └──────────────┘     └───────────┬──────────────┘│
│         │                    │                        │                │
│         │                    │                        │                │
│         ▼                    ▼                        ▼                │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │                    DUAL STORAGE LAYER                        │      │
│  │  ┌─────────────────────────┐  ┌─────────────────────────┐   │      │
│  │  │        SQLite           │  │      MEMORY.md          │   │      │
│  │  │  (Fast search/FTS5)    │  │  (Claude Code compat)  │   │      │
│  │  └─────────────────────────┘  └─────────────────────────┘   │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                │                                        │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │              Worker Service (port 37778)                      │      │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────┐  ┌────────────┐   │      │
│  │  │ Search  │  │Timeline │  │ Observations │  │ Summaries │   │      │
│  │  │  API    │  │  API    │  │    API      │  │    API    │   │      │
│  │  └─────────┘  └─────────┘  └─────────────┘  └────────────┘   │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                │                                        │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │              Consolidation Engine (Periodic)                    │      │
│  │  Phase 1: Orient  → Phase 2: Gather → Phase 3: Consolidate →   │      │
│  │  Phase 4: Prune                                               │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. FILE STRUCTURE

```
open-mem/
├── plugin/
│   └── index.ts              # Opencode plugin - event listeners
├── src/
│   ├── observer/
│   │   ├── queue.ts          # Observation queue management
│   │   └── types.ts          # Observation, ToolExecution types
│   ├── compressor/
│   │   └── ai.ts             # AI compression via Opencode SDK
│   ├── storage/
│   │   ├── sqlite.ts         # SQLite + FTS5 operations
│   │   ├── memory-md.ts      # MEMORY.md read/write
│   │   └── types.ts          # Session, Observation, Summary types
│   ├── search/
│   │   └── progressive.ts    # 3-layer search (search, timeline, get)
│   ├── consolidation/
│   │   └── engine.ts         # 4-phase consolidation (autoDream-style)
│   ├── worker/
│   │   └── server.ts         # HTTP API server
│   ├── inject/
│   │   └── context.ts        # Context injection on session.created
│   ├── privacy/
│   │   └── strip.ts          # Privacy tags & sensitive data stripping
│   ├── taxonomy/
│   │   └── types.ts          # Extended memory types
│   └── index.ts              # Main entry point
├── skills/
│   └── mem-search/
│       └── SKILL.md          # Search skill for Opencode
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. COMPONENTS CHI TIẾT

### 5.1 Plugin Events

```typescript
// plugin/index.ts
export const openMemPlugin: Plugin = async (ctx) => {
  return {
    // 1. Session starts → inject prior context
    'session.created': async ({ session }) => {
      await injectPriorContext(session.id);
    },
    
    // 2. Tool executed → queue for compression
    'tool.execute.after': async ({ input, output }) => {
      if (isHighValueTool(input.tool)) {
        queueObservation({
          tool: input.tool,
          input: input.args,
          output: output.result,
          sessionId: session.id,
          timestamp: Date.now()
        });
      }
    },
    
    // 3. Session idle → trigger consolidation check
    'session.idle': async () => {
      await checkConsolidation();
    },
    
    // 4. Session deleted → mark complete
    'session.deleted': async ({ session }) => {
      await markSessionComplete(session.id);
    }
  };
};

// High-value tools (skip grep, ls, etc.)
const HIGH_VALUE_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'NotebookEdit', 'WebSearch', 'WebFetch'
];

function isHighValueTool(tool: string): boolean {
  return HIGH_VALUE_TOOLS.includes(tool);
}
```

### 5.2 Observation Queue

```typescript
// src/observer/queue.ts
interface QueuedObservation {
  id: string;
  tool: string;
  input: unknown;
  output: unknown;
  sessionId: string;
  project: string;
  timestamp: number;
  retryCount: number;
}

class ObservationQueue {
  private queue: QueuedObservation[] = [];
  private processing = false;
  
  enqueue(obs: Omit<QueuedObservation, 'id' | 'retryCount'>): void {
    const item = { ...obs, id: crypto.randomUUID(), retryCount: 0 };
    this.queue.push(item);
    this.processNext();
  }
  
  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    
    const item = this.queue.shift()!;
    try {
      await compressAndStore(item);
    } catch (e) {
      if (item.retryCount < 3) {
        item.retryCount++;
        this.queue.push(item);
      }
    }
    
    this.processing = false;
    if (this.queue.length > 0) this.processNext();
  }
}
```

---

## 6. DATA MODEL

### 6.1 SQLite Schema

```sql
-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opencode_session_id TEXT UNIQUE NOT NULL,
  project TEXT NOT NULL,
  started_at TEXT NOT NULL,
  started_at_epoch INTEGER NOT NULL,
  completed_at TEXT,
  completed_at_epoch INTEGER,
  status TEXT CHECK(status IN ('active', 'completed', 'failed')) DEFAULT 'active'
);

CREATE INDEX idx_sessions_project ON sessions(project);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_started_at ON sessions(started_at);

-- Observations table
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  project TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN (
    'decision', 'bugfix', 'feature', 'refactor', 'discovery', 'feedback', 'reference'
  )),
  title TEXT NOT NULL,
  narrative TEXT,
  facts TEXT,           -- JSON array stringified
  concepts TEXT,        -- JSON array stringified
  files_read TEXT,      -- JSON array stringified
  files_modified TEXT,   -- JSON array stringified
  prompt_number INTEGER,
  discovery_tokens INTEGER DEFAULT 0,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  created_at_epoch INTEGER NOT NULL
);

CREATE INDEX idx_observations_session ON observations(session_id);
CREATE INDEX idx_observations_project ON observations(project);
CREATE INDEX idx_observations_type ON observations(type);
CREATE INDEX idx_observations_created ON observations(created_at);

-- Summaries table
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
);

CREATE INDEX idx_summaries_session ON summaries(session_id);
CREATE INDEX idx_summaries_project ON summaries(project);

-- User prompts table
CREATE TABLE IF NOT EXISTS user_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_number INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_at_epoch INTEGER NOT NULL
);

-- FTS5 virtual table for observations
CREATE VIRTUAL TABLE observations_fts USING fts5(
  title, narrative, facts,
  content='observations',
  content_rowid='id'
);

-- FTS5 virtual table for summaries
CREATE VIRTUAL TABLE summaries_fts USING fts5(
  request, investigated, learned, completed, next_steps, notes,
  content='summaries',
  content_rowid='id'
);

-- Trigger to keep FTS in sync
CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, narrative, facts)
  VALUES (new.id, new.title, new.narrative, new.facts);
END;

CREATE TRIGGER observations_ad AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, narrative, facts)
  VALUES('delete', old.id, old.title, old.narrative, old.facts);
END;

CREATE TRIGGER observations_au AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, narrative, facts)
  VALUES('delete', old.id, old.title, old.narrative, old.facts);
  INSERT INTO observations_fts(rowid, title, narrative, facts)
  VALUES (new.id, new.title, new.narrative, new.facts);
END;

-- Consolidation lock table
CREATE TABLE IF NOT EXISTS consolidation_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pid INTEGER,
  acquired_at INTEGER,
  sessions_reviewed INTEGER DEFAULT 0
);
```

### 6.2 MEMORY.md Format (Claude Code Compatible)

```markdown
---
name: memory
description: Persistent memory for Opencode
type: system
created: 2026-04-13
---

# Memory Index

- [User Preferences](user_preferences.md) — Prefers TypeScript, uses Vim keys
- [Auth Decision](auth_jwt_decision.md) — JWT with 1hr expiry, httpOnly cookies
- [Bugfix: Login Race](bugfix_login_race.md) — Fixed race condition in logout
- [Feature: Rate Limiting](feature_rate_limit.md) — Added Redis-based rate limiting
...

---

## Recent Updates

- 2026-04-13: Added rate limiting feature
- 2026-04-12: Fixed login race condition
- 2026-04-10: Decided on JWT auth approach
```

### 6.3 Topic File Format

```markdown
---
name: auth_jwt_decision
description: JWT authentication with 1hr expiry, httpOnly cookies for security
type: decision
created: 2026-04-10
updated: 2026-04-12
tags: [auth, security, backend]
---

## Summary

Chose JWT over session-based auth for stateless authentication.

## Details

- JWT stored in httpOnly cookie (not localStorage)
- 1hr expiry with refresh token rotation
- CSRF protection via SameSite=Strict

## Files Involved

- `src/auth/jwt.ts` - JWT utilities
- `src/middleware/auth.ts` - Auth middleware
- `src/routes/login.ts` - Login endpoint

## Related Decisions

- [Rate Limiting](rate_limit_decision.md) - Added after this
```

---

## 7. AI COMPRESSION

### 7.1 Compression Prompt

```typescript
// src/compressor/ai.ts
const COMPRESSION_PROMPT = `
You are compressing a tool execution into a structured memory.

Tool: {toolName}
Input: {input}
Output: {output}

Analyze this tool execution and return a JSON object with:
{
  "type": "decision|bugfix|feature|refactor|discovery|feedback|reference",
  "title": "Concise title (max 80 chars)",
  "narrative": "1-2 sentence explanation of what happened",
  "facts": ["Key fact 1", "Key fact 2"],
  "concepts": ["Concept learned"],
  "filesRead": ["file1.ts"],
  "filesModified": ["file2.ts"]
}

Rules:
- title must be max 80 characters
- facts should be specific, not generic
- Only include files that were actually read/modified
- type must match the taxonomy above
- If nothing worth remembering, return null
`;

async function compressObservation(
  tool: string,
  input: unknown,
  output: unknown,
  sessionId: string
): Promise<CompressedObservation | null> {
  const prompt = COMPRESSION_PROMPT
    .replace('{toolName}', tool)
    .replace('{input}', JSON.stringify(input, null, 2))
    .replace('{output}', JSON.stringify(output, null, 2));

  const result = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text" as const, text: prompt }],
      format: {
        type: "json_schema" as const,
        schema: {
          type: "object",
          properties: {
            type: { 
              type: "string", 
              enum: ["decision", "bugfix", "feature", "refactor", "discovery", "feedback", "reference"]
            },
            title: { type: "string", maxLength: 80 },
            narrative: { type: "string" },
            facts: { type: "array", items: { type: "string" } },
            concepts: { type: "array", items: { type: "string" } },
            filesRead: { type: "array", items: { type: "string" } },
            filesModified: { type: "array", items: { type: "string" } }
          },
          required: ["type", "title"]
        }
      }
    }
  });

  return result.data.info.structured_output;
}
```

### 7.2 Observation Schema

```typescript
// src/taxonomy/types.ts
export const OBSERVATION_TYPES = [
  'decision',    // Architecture, tech stack decisions
  'bugfix',      // Bug fixes
  'feature',     // New features implemented
  'refactor',    // Code refactoring
  'discovery',   // Learning something new about codebase
  'feedback',    // User preferences, corrections
  'reference'    // External docs, links, resources
] as const;

export type ObservationType = typeof OBSERVATION_TYPES[number];

export interface CompressedObservation {
  id?: number;
  sessionId: string;
  project: string;
  type: ObservationType;
  title: string;
  narrative?: string;
  facts: string[];
  concepts: string[];
  filesRead: string[];
  filesModified: string[];
  promptNumber: number;
  createdAt: string;
  createdAtEpoch: number;
}

export interface SessionSummary {
  id?: number;
  sessionId: string;
  project: string;
  request: string;
  investigated: string;
  learned: string;
  completed: string;
  nextSteps: string;
  filesRead: string[];
  filesEdited: string[];
  notes: string;
  promptNumber: number;
  createdAt: string;
  createdAtEpoch: number;
}
```

---

## 8. SEARCH SYSTEM

### 8.1 Progressive Disclosure (3-Layer)

```typescript
// src/search/progressive.ts

/**
 * Layer 1: Search - compact index (~50-100 tokens/result)
 * Returns minimal info for initial filtering
 */
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
  
  let sql = `
    SELECT o.id, o.type, o.title, o.created_at
    FROM observations_fts fts
    JOIN observations o ON o.id = fts.rowid
    WHERE observations_fts MATCH ?
  `;
  const params: (string | number)[] = [query];
  
  if (type) {
    sql += ' AND o.type = ?';
    params.push(type);
  }
  
  if (project) {
    sql += ' AND o.project = ?';
    params.push(project);
  }
  
  sql += ' ORDER BY rank LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return db.prepare(sql).all(...params);
}

/**
 * Layer 2: Timeline - chronological context around anchor
 * Returns observations before/after a specific one
 */
export async function timeline(
  anchorId: number,
  options: {
    depthBefore?: number;
    depthAfter?: number;
    project?: string;
  } = {}
): Promise<Observation[]> {
  const { depthBefore = 3, depthAfter = 3, project } = options;
  
  const anchor = await db.prepare(
    'SELECT id, created_at_epoch FROM observations WHERE id = ?'
  ).get(anchorId);
  
  if (!anchor) return [];
  
  const rows = await db.prepare(`
    SELECT * FROM observations
    WHERE created_at_epoch BETWEEN ? AND ?
    ${project ? 'AND project = ?' : ''}
    ORDER BY created_at_epoch ASC
  `).all(
    anchor.created_at_epoch - (depthBefore * 3600 * 1000),
    anchor.created_at_epoch + (depthAfter * 3600 * 1000),
    ...(project ? [project] : [])
  );
  
  return rows;
}

/**
 * Layer 3: Get - full details for filtered IDs
 * Only call this after filtering with search/timeline
 */
export async function getObservations(
  ids: number[],
  options: { project?: string } = {}
): Promise<Observation[]> {
  if (ids.length === 0) return [];
  
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`
    SELECT * FROM observations
    WHERE id IN (${placeholders})
    ${options.project ? 'AND project = ?' : ''}
    ORDER BY created_at_epoch DESC
  `).all(...ids, ...(options.project ? [options.project] : []));
}
```

### 8.2 Worker API Endpoints

```typescript
// src/worker/server.ts
const WORKER_PORT = 37778;

const endpoints = {
  // Health
  'GET /health': () => ({ status: 'ok', timestamp: Date.now() }),
  
  // Layer 1: Search
  'GET /api/search': async (req) => {
    const { q, type, project, limit, offset } = req.query;
    const results = await search(q, { type, project, limit, offset });
    return results;
  },
  
  // Layer 2: Timeline
  'GET /api/timeline': async (req) => {
    const { anchor, depth_before, depth_after, project } = req.query;
    const results = await timeline(Number(anchor), { 
      depthBefore: Number(depth_before),
      depthAfter: Number(depth_after),
      project 
    });
    return results;
  },
  
  // Layer 3: Batch observations
  'POST /api/observations/batch': async (req) => {
    const { ids, project } = req.body;
    const results = await getObservations(ids, { project });
    return results;
  },
  
  // Recent summaries
  'GET /api/summaries/recent': async (req) => {
    const { project, limit = 10 } = req.query;
    return db.prepare(`
      SELECT * FROM summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(project, limit);
  },
  
  // Single observation
  'GET /api/observations/:id': async (req) => {
    return db.prepare(
      'SELECT * FROM observations WHERE id = ?'
    ).get(req.params.id);
  },
  
  // Session observations
  'GET /api/sessions/:id/observations': async (req) => {
    return db.prepare(
      'SELECT * FROM observations WHERE session_id = ? ORDER BY created_at_epoch'
    ).all(req.params.id);
  }
};
```

---

## 9. CONSOLIDATION ENGINE

### 9.1 4-Phase Consolidation (Claude Code autoDream style)

```typescript
// src/consolidation/engine.ts

const CONSOLIDATION_PROMPT = `
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

interface ConsolidationResult {
  memoriesUpdated: string[];
  memoriesCreated: string[];
  memoriesDeleted: string[];
  indexUpdated: boolean;
}

async function runConsolidation(): Promise<ConsolidationResult | null> {
  // Check gates: 24h AND 5 new sessions
  if (!shouldConsolidate()) return null;
  
  // Acquire lock
  const acquired = await tryAcquireLock();
  if (!acquired) return null;
  
  try {
    const memoryDir = getMemoryDir();
    const projectDir = getProjectDir();
    
    const prompt = CONSOLIDATION_PROMPT
      .replace('{memoryDir}', memoryDir)
      .replace('{projectDir}', projectDir);
    
    const result = await client.session.prompt({
      body: {
        parts: [{ type: "text" as const, text: prompt }],
        format: {
          type: "json_schema" as const,
          schema: consolidationSchema
        }
      }
    });
    
    const changes = result.data.info.structured_output as ConsolidationResult;
    
    // Apply changes
    await applyChanges(changes);
    
    // Release lock
    await releaseLock();
    
    return changes;
  } catch (e) {
    await rollbackLock();
    return null;
  }
}

function shouldConsolidate(): boolean {
  const lastRun = getLastConsolidationTime();
  const hoursSince = (Date.now() - lastRun) / 3_600_000;
  
  if (hoursSince < 24) return false;
  
  const newSessions = countSessionsSince(lastRun);
  return newSessions >= 5;
}
```

### 9.2 Lock Mechanism

```typescript
// Prevents concurrent consolidation runs
async function tryAcquireLock(): Promise<boolean> {
  const lock = db.prepare('SELECT * FROM consolidation_lock WHERE id = 1').get();
  
  if (lock) {
    const stale = Date.now() - lock.acquired_at > 60 * 60 * 1000; // 1hr
    const processAlive = isProcessRunning(lock.pid);
    
    if (!stale && processAlive) return false; // Lock held
  }
  
  db.prepare(`
    INSERT OR REPLACE INTO consolidation_lock (id, pid, acquired_at, sessions_reviewed)
    VALUES (1, ?, ?, 0)
  `).run(process.pid, Date.now(), countSessionsSince(0));
  
  return true;
}
```

---

## 10. CONTEXT INJECTION

### 10.1 Inject Prior Context on Session Start

```typescript
// src/inject/context.ts

export async function injectPriorContext(sessionId: string): Promise<void> {
  const project = await getCurrentProject();
  
  // Get recent observations (last 5)
  const recentObs = await search(project, { limit: 5 });
  
  // Get last session summary
  const lastSummary = await db.prepare(`
    SELECT * FROM summaries
    WHERE project = ?
    ORDER BY created_at_epoch DESC
    LIMIT 1
  `).get(project);
  
  // Build context prompt
  const contextParts: string[] = [
    '## Prior Context from open-mem',
    '',
    'This context is injected automatically from your persistent memory.',
    ''
  ];
  
  if (lastSummary) {
    contextParts.push(
      '### Last Session Summary',
      `- Request: ${lastSummary.request}`,
      `- Completed: ${lastSummary.completed}`,
      `- Learned: ${lastSummary.learned}`,
      `- Next Steps: ${lastSummary.next_steps}`,
      ''
    );
  }
  
  if (recentObs.length > 0) {
    contextParts.push(
      '### Recent Memories',
      ...recentObs.map(o => `- [${o.type}] ${o.title}`),
      ''
    );
  }
  
  contextParts.push(
    '---',
    'To learn more: use the mem-search skill or query /api/search'
  );
  
  const context = contextParts.join('\n');
  
  // Inject via noReply prompt
  await client.session.prompt({
    path: { id: sessionId },
    body: {
      noReply: true,
      parts: [{ type: "text" as const, text: context }]
    }
  });
}
```

---

## 11. PRIVACY & TAXONOMY

### 11.1 Privacy Tags Stripping

```typescript
// src/privacy/strip.ts

const SENSITIVE_PATTERNS: RegExp[] = [
  // Privacy tags
  /<private>[\s\S]*?<\/private>/gi,
  
  // API keys
  /api[_-]?key["\s:=]+["']?[\w-]+/gi,
  /apikey["\s:=]+["']?[\w-]+/gi,
  
  // Passwords
  /password["\s:=]+["']?[^\s"']+/gi,
  /passwd["\s:=]+["']?[^\s"']+/gi,
  
  // Tokens
  /token["\s:=]+["']?[\w-]+/gi,
  /bearer["\s:=]+["']?[\w-]+/gi,
  
  // Common secret patterns
  /sk-[\w]{20,}/gi,                    // OpenAI/GitHub keys
  /ghp_[\w]{36,}/gi,                   // GitHub personal access tokens
  /xox[baprs]-[a-zA-Z0-9]{10,}/gi,    // Slack tokens
  
  // Environment variables with values
  /ENV\w*\["[^"]+"\]\s*=\s*["'][^"']+["']/gi,
];

const REDACTED = '[REDACTED]';

export function stripSensitiveData(input: string): string {
  let result = input;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  
  return result;
}

// Also strip from AI compression output
export function sanitizeObservation(obs: CompressedObservation): CompressedObservation {
  return {
    ...obs,
    narrative: obs.narrative ? stripSensitiveData(obs.narrative) : undefined,
    facts: obs.facts.map(f => stripSensitiveData(f)),
  };
}
```

### 11.2 Extended Taxonomy

```typescript
// src/taxonomy/types.ts

/**
 * Memory Taxonomy (7 types)
 * 
 * decision    - Architecture, tech stack, implementation decisions
 * bugfix      - Bug fixes and their solutions
 * feature     - New features implemented
 * refactor    - Code refactoring (what changed and why)
 * discovery   - Learning something new about codebase/tech
 * feedback    - User preferences, corrections, workflow
 * reference   - External docs, links, resources, libraries
 */

export interface TaxonomyEntry {
  type: ObservationType;
  description: string;
  examples: string[];
  frontmatterTemplate: string;
}

export const TAXONOMY: Record<ObservationType, TaxonomyEntry> = {
  decision: {
    description: 'Architecture, tech stack, or implementation decisions',
    examples: [
      'Chose PostgreSQL over MongoDB',
      'JWT with httpOnly cookies',
      'Monorepo structure decision'
    ],
    frontmatterTemplate: `
---
name: {slug}
description: {description}
type: decision
created: {date}
tags: [{tags}]
---

## Decision

{summary}

## Alternatives Considered

{alternatives}

## Consequences

{consequences}
`
  },
  
  bugfix: {
    description: 'Bug fixes and their solutions',
    examples: [
      'Fixed race condition in login',
      'Memory leak in worker service',
      'Fixed CORS issue'
    ],
    frontmatterTemplate: `
---
name: {slug}
description: {description}
type: bugfix
created: {date}
tags: [{tags}]
---

## Bug

{bug_description}

## Root Cause

{root_cause}

## Solution

{solution}

## Files Changed

{files}
`
  },
  
  feature: {
    description: 'New features implemented',
    examples: [
      'Added rate limiting',
      'Implemented SSO login',
      'New dashboard component'
    ],
    frontmatterTemplate: `
---
name: {slug}
description: {description}
type: feature
created: {date}
tags: [{tags}]
---

## Feature

{summary}

## Implementation Notes

{notes}

## Files Added

{files}
`
  },
  
  refactor: {
    description: 'Code refactoring',
    examples: [
      'Extracted auth to separate module',
      'Moved to Repository pattern',
      'Component cleanup'
    ],
    frontmatterTemplate: `
---
name: {slug}
description: {description}
type: refactor
created: {date}
tags: [{tags}]
---

## What Changed

{summary}

## Why

{reason}

## Files

{files}
`
  },
  
  discovery: {
    description: 'Learning something new about codebase/tech',
    examples: [
      'Discovered legacy auth flow',
      'Found performance bottleneck',
      'Learned how X library works'
    ],
    frontmatterTemplate: `
---
name: {slug}
description: {description}
type: discovery
created: {date}
tags: [{tags}]
---

## Discovery

{what}

## Implications

{implications}

## Related Files

{files}
`
  },
  
  feedback: {
    description: 'User preferences and corrections',
    examples: [
      'User prefers short responses',
      'Use bun not npm',
      'TDD workflow preference'
    ],
    frontmatterTemplate: `
---
name: {slug}
description: {description}
type: feedback
created: {date}
audience: [internal|user|team]
---

## Feedback

{feedback}

## Context

{context}

## Action Taken

{action}
`
  },
  
  reference: {
    description: 'External docs, links, resources',
    examples: [
      'Useful library documentation',
      'Architecture diagram link',
      'API documentation'
    ],
    frontmatterTemplate: `
---
name: {slug}
description: {description}
type: reference
created: {date}
url: {url}
tags: [{tags}]
---

## Summary

{summary}

## Key Points

{points}

## When to Use

{when_to_use}
`
  }
};
```

---

## 12. TRANSCRIPTS

### 12.1 Transcript Search via Opencode API

```typescript
// src/storage/transcripts.ts

interface TranscriptSearchResult {
  sessionId: string;
  messageId: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  relevanceScore: number;
}

export async function searchTranscripts(
  query: string,
  options: {
    project?: string;
    sessions?: string[];
    limit?: number;
  } = {}
): Promise<TranscriptSearchResult[]> {
  const { project, sessions, limit = 50 } = options;
  
  // Get sessions to search
  let sessionIds = sessions;
  if (!sessionIds && project) {
    const projectSessions = await db.prepare(`
      SELECT opencode_session_id FROM sessions
      WHERE project = ?
      ORDER BY started_at_epoch DESC
      LIMIT 100
    `).all(project);
    sessionIds = projectSessions.map((s: any) => s.opencode_session_id);
  }
  
  if (!sessionIds || sessionIds.length === 0) return [];
  
  const results: TranscriptSearchResult[] = [];
  
  for (const sessionId of sessionIds.slice(0, 20)) { // Limit API calls
    try {
      const messages = await client.session.messages({
        path: { id: sessionId }
      });
      
      for (const msg of messages) {
        const content = extractTextContent(msg.parts);
        if (content.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            sessionId,
            messageId: msg.info.id,
            type: msg.info.type,
            content: content.slice(0, 200), // Truncate
            timestamp: msg.info.created_at,
            relevanceScore: calculateRelevance(content, query)
          });
        }
      }
    } catch (e) {
      // Session may not exist anymore
      continue;
    }
  }
  
  return results
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

function extractTextContent(parts: Part[]): string {
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join(' ');
}

function calculateRelevance(content: string, query: string): number {
  const lower = content.toLowerCase();
  const queryLower = query.toLowerCase();
  
  let score = 0;
  if (lower.includes(queryLower)) score += 1;
  score += (lower.split(queryLower).length - 1) * 0.5; // Multiple occurrences
  score += content.toLowerCase().startsWith(queryLower) ? 2 : 0; // Starts with
  
  return score;
}
```

---

## 13. INSTALLATION

### 13.1 Package.json

```json
{
  "name": "open-mem",
  "version": "1.0.0",
  "description": "Persistent memory system for Opencode",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "open-mem": "dist/cli.js",
    "open-mem-worker": "dist/worker/server.js"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "dev": "tsc --watch",
    "test": "vitest",
    "lint": "eslint src/**/*.ts"
  },
  "dependencies": {
    "@opencode-ai/sdk": "^0.0.0",
    "better-sqlite3": "^11.0.0",
    "express": "^4.18.2",
    "zod": "^3.22.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/express": "^4.17.21",
    "@types/uuid": "^9.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "opencode",
    "memory",
    "persistent-memory",
    "ai-agent",
    "productivity"
  ],
  "license": "MIT"
}
```

### 13.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 13.3 Opencode Configuration

```json
// opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["open-mem"]
}
```

---

## 14. USAGE

### 14.1 Daily Usage (Automatic)

```
┌─────────────────────────────────────────────────────────────┐
│  Bạn: "fix bug login"                                      │
│  Opencode làm việc → tool.execute.after → auto capture     │
│  AI compress → lưu vào SQLite + MEMORY.md                  │
│                                                             │
│  Kết thúc session → session.idle → consolidation chạy      │
│                                                             │
│  Lần sau: "fix bug gì đó"                                  │
│  session.created → injectPriorContext → memories được đưa vào│
└─────────────────────────────────────────────────────────────┘
```

### 14.2 Chủ động hỏi về Memory

```bash
# Hỏi Opencode về memories
You: "Những quyết định nào tôi đã make về auth?"
Opencode: "Dựa trên memory, bạn đã quyết định..."

# Hoặc dùng skill
You: @mem-search "authentication JWT"
```

### 14.3 MEMORY.md Location

```
~/.config/opencode/memory/
├── MEMORY.md              # Index (200 lines max)
├── user_preferences.md    # Topic files
├── auth_decisions.md
├── bugfixes.md
└── ...
```

### 14.4 Web UI (Optional Future)

```
http://localhost:37778
- Search memories
- View timeline
- See session summaries
```

---

## 15. SO SÁNH VỚI CLAUDE-MEM

| Feature | Claude-Mem | open-mem |
|---------|-----------|----------|
| Platform | Claude Code | Opencode |
| Hooks | 5 lifecycle hooks | Event-based |
| Database | SQLite + Chroma | SQLite only |
| Vector Search | Yes (Chroma) | FTS5 only |
| Web UI | Full viewer | Deferred |
| AI Compression | Claude Agent SDK | Opencode SDK |
| MCP Tools | 4 tools | Future |
| Privacy Tags | Yes | Yes |
| Taxonomy | 6 types | 7 types |
| Consolidation | Manual | autoDream-style |
| MEMORY.md | No | Yes |
| Transcript Search | JSONL files | API-based |

---

## 16. IMPLEMENTATION PHASES

### Phase 1: Core Infrastructure (MVP)
- [ ] Plugin setup with event listeners
- [ ] SQLite database initialization
- [ ] Basic observation capture (no AI compression)
- [ ] Simple storage without progressive disclosure
- [ ] Context injection on session start

### Phase 2: AI Compression
- [ ] Opencode SDK integration
- [ ] Structured output parsing
- [ ] Compression queue management
- [ ] Error handling/retry

### Phase 3: Advanced Search
- [ ] FTS5 full-text search
- [ ] Progressive disclosure (3-layer)
- [ ] Worker API server
- [ ] Timeline and batch APIs

### Phase 4: Memory MD
- [ ] MEMORY.md generation
- [ ] Topic file management
- [ ] Index synchronization

### Phase 5: Consolidation
- [ ] 4-phase consolidation engine
- [ ] Lock file mechanism
- [ ] Periodic trigger (24h + session count)

### Phase 6: Privacy & Taxonomy
- [ ] Privacy tags stripping
- [ ] Extended taxonomy support
- [ ] Transcript search via API

### Phase 7: Polish (Future)
- [ ] Web UI viewer
- [ ] MCP tools
- [ ] Installation script
- [ ] Documentation

---

## FILES TO CREATE

```
open-mem/
├── plugin/
│   └── index.ts
├── src/
│   ├── observer/
│   │   ├── queue.ts
│   │   └── types.ts
│   ├── compressor/
│   │   └── ai.ts
│   ├── storage/
│   │   ├── sqlite.ts
│   │   ├── memory-md.ts
│   │   ├── types.ts
│   │   └── transcripts.ts
│   ├── search/
│   │   └── progressive.ts
│   ├── consolidation/
│   │   └── engine.ts
│   ├── worker/
│   │   └── server.ts
│   ├── inject/
│   │   └── context.ts
│   ├── privacy/
│   │   └── strip.ts
│   ├── taxonomy/
│   │   └── types.ts
│   └── index.ts
├── skills/
│   └── mem-search/
│       └── SKILL.md
├── package.json
├── tsconfig.json
└── README.md
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-04-13
