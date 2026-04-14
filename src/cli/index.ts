#!/usr/bin/env node

import { install } from './commands/install.js';
import { uninstall } from './commands/uninstall.js';
import { serve } from './commands/serve.js';

const command = process.argv[2] || 'help';

async function main() {
  console.log('[session-memory-opencode] CLI v1.0.0\n');

  switch (command) {
    case 'install':
      await install();
      break;
    case 'uninstall':
      await uninstall();
      break;
    case 'serve':
      await serve();
      break;
    case 'help':
    default:
      showHelp();
  }
}

function showHelp() {
  console.log(`
session-memory-opencode - Persistent memory system for Opencode

Usage:
  session-memory-opencode <command> [options]

Commands:
  install     Install session-memory-opencode plugin to Opencode
  uninstall   Remove session-memory-opencode plugin from Opencode
  serve       Start the dashboard server
  help        Show this help message

Examples:
  npx session-memory-opencode install     Install the plugin
  npx session-memory-opencode uninstall   Remove the plugin
  npx session-memory-opencode serve      Start dashboard server

Dashboard:
  After running 'serve', open http://localhost:37778/dashboard

For more information, see: https://github.com/tinnhat/session-memory-opencode
`);
}

main().catch(err => {
  console.error('[session-memory-opencode] Error:', err.message);
  process.exit(1);
});
