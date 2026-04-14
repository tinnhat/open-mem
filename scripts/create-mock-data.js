#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

const MEMORY_DIR = path.join(os.homedir(), '.config', 'opencode', 'memory');
const DB_PATH = path.join(MEMORY_DIR, 'memory.db');

async function createMockData() {
  console.log('🔧 Creating mock data at:', MEMORY_DIR);

  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('   Removed existing database');
  }

  const db = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(database);
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        type TEXT NOT NULL,
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
    `, (err) => {
      if (err) reject(err);
      else resolve(null);
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE summaries (
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
    `, (err) => {
      if (err) reject(err);
      else resolve(null);
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE user_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        prompt_number INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL
      )
    `, (err) => {
      if (err) reject(err);
      else resolve(null);
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE consolidation_lock (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        pid INTEGER,
        acquired_at INTEGER,
        sessions_reviewed INTEGER DEFAULT 0
      )
    `, (err) => {
      if (err) reject(err);
      else resolve(null);
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`
      CREATE VIRTUAL TABLE observations_fts USING fts5(
        title,
        narrative,
        facts,
        content='observations',
        content_rowid='id',
        tokenize='porter unicode61'
      )
    `, (err) => {
      if (err) reject(err);
      else resolve(null);
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts(rowid, title, narrative, facts)
        VALUES (new.id, new.title, new.narrative, new.facts);
      END
    `, (err) => {
      if (err) reject(err);
      else resolve(null);
    });
  });

  const now = Date.now();
  const mockObservations = [
    { type: 'bugfix', title: 'Fix authentication bug', narrative: 'Fixed login token expiry issue', facts: '["token expires too quickly"]', session: 'session-001', project: 'D:/CODE/test' },
    { type: 'bugfix', title: 'Fix authentication bug', narrative: 'Fixed login token expiry issue', facts: '["token expires too quickly"]', session: 'session-001b', project: 'D:/CODE/test' },
    { type: 'feature', title: 'Add user registration', narrative: 'Implemented new user signup flow', facts: '["email validation", "password hashing"]', session: 'session-001', project: 'D:/CODE/test' },
    { type: 'decision', title: 'Choose SQLite for storage', narrative: 'Decided to use SQLite for simplicity', facts: '["SQLite is embedded", "no setup required"]', session: 'session-002', project: 'D:/CODE/test' },
    { type: 'refactor', title: 'Extract utility functions', narrative: 'Moved helper functions to separate module', facts: '["reused across 5 files"]', session: 'session-002', project: 'D:/CODE/test' },
    { type: 'discovery', title: 'Found memory leak in worker', narrative: 'Discovered connection pool not closing properly', facts: '["affects long-running processes"]', session: 'session-003', project: 'D:/CODE/test' },
  ];

  for (let i = 0; i < mockObservations.length; i++) {
    const obs = mockObservations[i];
    const timestamp = now - (i * 3600000);
    const hash = `hash${String(i).padStart(4, '0')}`;

    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO observations (session_id, project, type, title, narrative, facts, content_hash, created_at, created_at_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [obs.session, obs.project, obs.type, obs.title, obs.narrative, obs.facts, hash, new Date(timestamp).toISOString(), timestamp], (err) => {
        if (err) reject(err);
        else resolve(null);
      });
    });
  }

  await new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO user_prompts (session_id, prompt_text, prompt_number, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `, ['session-001', 'Add user login feature', 1, new Date(now - 7200000).toISOString(), now - 7200000], (err) => {
      if (err) reject(err);
      else resolve(null);
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO user_prompts (session_id, prompt_text, prompt_number, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `, ['session-002', 'Setup database', 1, new Date(now - 3600000).toISOString(), now - 3600000], (err) => {
      if (err) reject(err);
      else resolve(null);
    });
  });

  const memoryMdContent = `---
name: memory
description: Persistent memory for Opencode
type: system
created: ${new Date().toISOString().split('T')[0]}
---

# Memory Index

---

## Recent Updates

- [Fix authentication bug](bugfix_fix_authentication_bug_1.md) — bugfix
- [Add user registration](feature_add_user_registration_2.md) — feature
- [Choose SQLite for storage](decision_choose_sqlite_for_storage_3.md) — decision

`;

  fs.writeFileSync(path.join(MEMORY_DIR, 'MEMORY.md'), memoryMdContent, 'utf-8');

  const topicContent = `---
name: bugfix_fix_authentication_bug_1
description: Fix authentication bug
type: bugfix
created: ${new Date().toISOString().split('T')[0]}
project: D:/CODE/test
---

🐛 **BUGFIX**

## Fix authentication bug

Fixed login token expiry issue

## Key Facts

- token expires too quickly

---
_Last updated: ${new Date().toISOString()}_
`;

  fs.writeFileSync(path.join(MEMORY_DIR, 'bugfix_fix_authentication_bug_1.md'), topicContent, 'utf-8');

  db.close();

  console.log('✅ Mock data created successfully!');
  console.log(`   - ${mockObservations.length} observations`);
  console.log('   - 2 user prompts');
  console.log('   - MEMORY.md + 1 topic file');
}

createMockData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
