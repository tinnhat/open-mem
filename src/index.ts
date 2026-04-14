export * from './observer/queue.js';
export * from './observer/types.js';
export * from './storage/sqlite.js';
export { SessionStatus, Session, UserPrompt } from './storage/types.js';
export * from './storage/memory-md.js';
export * from './taxonomy/types.js';
export * from './search/progressive.js';
export * from './privacy/strip.js';
export * from './consolidation/index.js';
export * from './inject/context.js';

export { startServer } from './worker/server.js';
export { default as workerServer } from './worker/server.js';

import { initDatabase } from './storage/sqlite.js';

export async function initialize(): Promise<void> {
  await initDatabase();
}
