import { spawn } from 'child_process';
import { getOllamaCommand } from '../utils/platform.js';

const OLLAMA_HOST = 'http://localhost:11434';
const DASHBOARD_PORT = 37778;

let servicesStarted = false;

export async function ensureOllama(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/version`);
    if (response.ok) {
      console.log('[open-mem] Ollama already running');
      return true;
    }
  } catch {
    console.log('[open-mem] Ollama not running, starting...');
  }

  return new Promise((resolve) => {
    try {
      const ollamaCmd = getOllamaCommand();
      
      const proc = spawn(ollamaCmd, ['serve'], {
        detached: true,
        stdio: 'ignore',
        shell: true,
      });

      proc.unref();

      let attempts = 0;
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const response = await fetch(`${OLLAMA_HOST}/api/version`);
          if (response.ok) {
            clearInterval(checkInterval);
            console.log('[open-mem] Ollama started successfully');
            resolve(true);
          }
        } catch {
          if (attempts > 30) {
            clearInterval(checkInterval);
            console.warn('[open-mem] Failed to start Ollama after 30s');
            resolve(false);
          }
        }
      }, 1000);
    } catch (err) {
      console.warn('[open-mem] Could not start Ollama:', err);
      resolve(false);
    }
  });
}

export async function ensureDashboard(): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${DASHBOARD_PORT}/health`);
    if (response.ok) {
      console.log('[open-mem] Dashboard already running');
      return true;
    }
  } catch {
    console.log('[open-mem] Dashboard not running, starting...');
  }

  return new Promise((resolve) => {
    import('../worker/server.js').then(({ startServer }) => {
      startServer().then(() => {
        console.log('[open-mem] Dashboard started successfully');
        resolve(true);
      }).catch((err: any) => {
        console.warn('[open-mem] Failed to start dashboard:', err);
        resolve(false);
      });
    }).catch((err) => {
      console.warn('[open-mem] Could not start dashboard:', err);
      resolve(false);
    });
  });
}

export async function ensureServices(): Promise<void> {
  if (servicesStarted) {
    return;
  }

  console.log('[open-mem] Starting services...');
  
  await ensureOllama();
  await ensureDashboard();
  
  servicesStarted = true;
  console.log('[open-mem] Services ready');
}
