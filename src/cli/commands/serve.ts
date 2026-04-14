import { startServer } from '../../worker/server.js';

export async function serve() {
  console.log('[session-memory-opencode] Starting dashboard server...\n');
  
  try {
    await startServer();
    console.log('[session-memory-opencode] Dashboard server running!');
    console.log('[session-memory-opencode] Access dashboard at: http://localhost:37778/dashboard');
    console.log('[session-memory-opencode] Press Ctrl+C to stop\n');
  } catch (err: any) {
    console.error('[session-memory-opencode] Failed to start server:', err.message);
    process.exit(1);
  }
}
