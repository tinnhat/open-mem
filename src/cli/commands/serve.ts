import { startServer } from '../../worker/server.js';

export async function serve() {
  console.log('[opencode-mem] Starting dashboard server...\n');
  
  try {
    await startServer();
    console.log('[opencode-mem] Dashboard server running!');
    console.log('[opencode-mem] Access dashboard at: http://localhost:37778/dashboard');
    console.log('[opencode-mem] Press Ctrl+C to stop\n');
  } catch (err: any) {
    console.error('[opencode-mem] Failed to start server:', err.message);
    process.exit(1);
  }
}
