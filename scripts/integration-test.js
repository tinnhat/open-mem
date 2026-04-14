#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

const MEMORY_DIR = path.join(os.homedir(), '.config', 'opencode', 'memory');
const DB_PATH = path.join(MEMORY_DIR, 'memory.db');
const MEMORY_MD = path.join(MEMORY_DIR, 'MEMORY.md');

function log(msg, color = 'blue') {
  const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
  };
  console.log(`${colors[color]}%s\x1b[0m`, msg);
}

function logResult(result) {
  const icon = result.passed ? '✅' : '❌';
  const color = result.passed ? 'green' : 'red';
  log(`${icon} ${result.name}: ${result.message}`, color);
}

async function runTests() {
  const results = [];

  log('\n🔍 open-mem Integration Test Suite\n', 'blue');
  log('='.repeat(50), 'blue');

  // Test 1: Memory directory exists
  const dirExists = fs.existsSync(MEMORY_DIR);
  results.push({
    name: 'Memory directory exists',
    passed: dirExists,
    message: dirExists ? MEMORY_DIR : 'Directory not found',
  });

  // Test 2: Database exists
  const dbExists = fs.existsSync(DB_PATH);
  results.push({
    name: 'Database exists',
    passed: dbExists,
    message: dbExists ? DB_PATH : 'Database not found',
  });

  // Test 3: MEMORY.md exists
  const memoryMdExists = fs.existsSync(MEMORY_MD);
  results.push({
    name: 'MEMORY.md exists',
    passed: memoryMdExists,
    message: memoryMdExists ? MEMORY_MD : 'MEMORY.md not found',
  });

  if (!dbExists) {
    log('\n⚠️  Database not found. Run open-mem in Opencode first.\n', 'yellow');
    printResults(results);
    return false;
  }

  // Connect to database
  const db = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(database);
    });
  });

  // Test 4: Check tables exist
  const tables = await new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.name));
    });
  });

  const requiredTables = ['observations', 'summaries', 'user_prompts'];
  const missingTables = requiredTables.filter(t => !tables.includes(t));
  
  results.push({
    name: 'Required tables exist',
    passed: missingTables.length === 0,
    message: missingTables.length === 0 
      ? `Found: ${tables.join(', ')}` 
      : `Missing: ${missingTables.join(', ')}`,
  });

  // Test 5: Check observations count
  const obsCount = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM observations', (err, row) => {
      if (err) reject(err);
      else resolve(row?.count ?? 0);
    });
  });

  results.push({
    name: 'Observations stored',
    passed: obsCount > 0,
    message: obsCount > 0 ? `${obsCount} observations found` : 'No observations yet',
  });

  // Test 6: Check FTS5 virtual table
  const ftsExists = tables.includes('observations_fts');
  results.push({
    name: 'FTS5 search enabled',
    passed: ftsExists,
    message: ftsExists ? 'FTS5 virtual table exists' : 'FTS5 not found',
  });

  // Test 7: Check content_hash populated
  const hashedCount = await new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM observations WHERE content_hash IS NOT NULL", (err, row) => {
      if (err) reject(err);
      else resolve(row?.count ?? 0);
    });
  });

  results.push({
    name: 'Deduplication hash populated',
    passed: hashedCount > 0,
    message: hashedCount > 0 
      ? `${hashedCount}/${obsCount} observations hashed`
      : 'No hashes found',
  });

  // Test 8: Check user_prompts stored
  const promptsCount = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM user_prompts', (err, row) => {
      if (err) reject(err);
      else resolve(row?.count ?? 0);
    });
  });

  results.push({
    name: 'User prompts tracked',
    passed: promptsCount > 0,
    message: promptsCount > 0 ? `${promptsCount} prompts stored` : 'No prompts tracked',
  });

  // Test 9: Check topic files exist
  let topicFiles = [];
  if (fs.existsSync(MEMORY_DIR)) {
    topicFiles = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
  }

  results.push({
    name: 'MEMORY.md topic files',
    passed: topicFiles.length > 0,
    message: topicFiles.length > 0 
      ? `${topicFiles.length} topic files found` 
      : 'No topic files yet',
  });

  // Test 10: Get recent observations
  const recentObs = await new Promise((resolve, reject) => {
    db.all(
      'SELECT id, type, title, created_at FROM observations ORDER BY created_at_epoch DESC LIMIT 5',
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });

  if (recentObs.length > 0) {
    log('\n📋 Recent Observations:', 'blue');
    for (const obs of recentObs) {
      log(`   [${obs.type}] ${obs.title} (id:${obs.id})`, 'blue');
    }
  }

  // Test 11: Check deduplication stats
  const dedupStats = await new Promise((resolve) => {
    db.get(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT content_hash) as unique_hash
      FROM observations
      WHERE content_hash IS NOT NULL
    `, (err, row) => {
      if (err) resolve({ total: 0, unique: 0 });
      else resolve({ total: row?.total ?? 0, unique: row?.unique_hash ?? 0 });
    });
  });

  results.push({
    name: 'Deduplication effectiveness',
    passed: dedupStats.total > 0,
    message: dedupStats.total > 0 
      ? `${dedupStats.unique} unique / ${dedupStats.total} total (hash dedup enabled)` 
      : 'No data to compare',
  });

  db.close();

  printResults(results);

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  log('\n' + '='.repeat(50), 'blue');
  log(`Result: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');
  
  if (passed === total) {
    log('\n🎉 All integration tests passed!\n', 'green');
  } else {
    log('\n⚠️  Some tests failed. Check above for details.\n', 'yellow');
  }

  return passed === total;
}

function printResults(results) {
  log('\n📊 Test Results:', 'blue');
  for (const result of results) {
    logResult(result);
  }
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    log(`\n❌ Error running tests: ${err.message}\n`, 'red');
    process.exit(1);
  });
