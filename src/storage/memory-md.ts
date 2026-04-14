import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const MEMORY_DIR = path.join(os.homedir(), '.config', 'opencode', 'memory');
const MEMORY_INDEX = 'MEMORY.md';

export function getMemoryDir(): string {
  return MEMORY_DIR;
}

function ensureMemoryDir(): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

export async function readMemoryIndex(): Promise<string> {
  ensureMemoryDir();
  const indexPath = path.join(MEMORY_DIR, MEMORY_INDEX);
  if (!fs.existsSync(indexPath)) {
    const defaultContent = `---
name: memory
description: Persistent memory for Opencode
type: system
created: ${new Date().toISOString().split('T')[0]}
---

# Memory Index

---

## Recent Updates

`;
    fs.writeFileSync(indexPath, defaultContent, 'utf-8');
    return defaultContent;
  }
  return fs.readFileSync(indexPath, 'utf-8');
}

export async function writeMemoryIndex(index: string): Promise<void> {
  ensureMemoryDir();
  const indexPath = path.join(MEMORY_DIR, MEMORY_INDEX);
  fs.writeFileSync(indexPath, index, 'utf-8');
}

export async function readTopicFile(name: string): Promise<string | null> {
  ensureMemoryDir();
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(MEMORY_DIR, `${safeName}.md`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

export async function writeTopicFile(name: string, content: string): Promise<void> {
  ensureMemoryDir();
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(MEMORY_DIR, `${safeName}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
}

export async function getAllTopicFiles(): Promise<string[]> {
  ensureMemoryDir();
  const files = fs.readdirSync(MEMORY_DIR);
  return files
    .filter(f => f.endsWith('.md') && f !== MEMORY_INDEX)
    .map(f => f.replace(/\.md$/, ''));
}

export async function updateIndexEntry(
  entry: string,
  link: string,
  description: string
): Promise<void> {
  const index = await readMemoryIndex();
  const safeLink = link.replace(/[^a-zA-Z0-9_-]/g, '_');
  const newEntry = `- [${entry}](${safeLink}.md) — ${description}`;
  
  const linkRegex = new RegExp(`\\[${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\(${safeLink}\\.md\\)`);
  
  if (linkRegex.test(index)) {
    const updatedIndex = index.replace(linkRegex, newEntry);
    await writeMemoryIndex(updatedIndex);
  } else {
    const insertMarker = '## Recent Updates';
    const recentUpdatesIndex = index.indexOf(insertMarker);
    
    if (recentUpdatesIndex !== -1) {
      const beforeRecentUpdates = index.substring(0, recentUpdatesIndex).trimEnd();
      const recentUpdates = index.substring(recentUpdatesIndex);
      const updatedIndex = `${beforeRecentUpdates}\n${newEntry}\n\n${recentUpdates}`;
      await writeMemoryIndex(updatedIndex);
    } else {
      const updatedIndex = index.trimEnd() + `\n${newEntry}\n`;
      await writeMemoryIndex(updatedIndex);
    }
  }
}

export async function removeIndexEntry(link: string): Promise<void> {
  const index = await readMemoryIndex();
  const safeLink = link.replace(/[^a-zA-Z0-9_-]/g, '_');
  const entryRegex = new RegExp(`- \\[.*?\\]\\(${safeLink}\\.md\\)\\s*—\\s*.*?\\n`, 'g');
  const updatedIndex = index.replace(entryRegex, '');
  await writeMemoryIndex(updatedIndex);
}
