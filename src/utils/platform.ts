import os from 'os';
import path from 'path';

export function getOpenCodeConfigDir(): string {
  const homeDir = os.homedir();
  
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Roaming', 'opencode');
  } else if (process.platform === 'darwin') {
    return path.join(homeDir, '.config', 'opencode');
  } else {
    return path.join(homeDir, '.config', 'opencode');
  }
}

export function getMemoryDir(): string {
  return path.join(getOpenCodeConfigDir(), 'memory');
}

export function getPluginDir(): string {
  return path.join(getOpenCodeConfigDir(), 'plugins', 'session-memory-opencode');
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function isMac(): boolean {
  return process.platform === 'darwin';
}

export function isLinux(): boolean {
  return process.platform === 'linux';
}

export function getOllamaCommand(): string {
  if (isWindows()) {
    return 'ollama.exe';
  }
  return 'ollama';
}
