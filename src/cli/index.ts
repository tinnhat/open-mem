#!/usr/bin/env node

import { install } from './commands/install.js';
import { uninstall } from './commands/uninstall.js';
import { serve } from './commands/serve.js';

const command = process.argv[2] || 'help';

async function main() {
  console.log('[opencode-mem] CLI v1.0.0\n');

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
opencode-mem - Persistent memory system for Opencode

Usage:
  opencode-mem <command> [options]

Commands:
  install     Install opencode-mem plugin to Opencode
  uninstall   Remove opencode-mem plugin from Opencode
  serve       Start the dashboard server
  help        Show this help message

Examples:
  npx opencode-mem install     Install the plugin
  npx opencode-mem uninstall   Remove the plugin
  npx opencode-mem serve      Start dashboard server

Dashboard:
  After running 'serve', open http://localhost:37778/dashboard

For more information, see: https://github.com/tinnhat/opencode-mem
`);
}

main().catch(err => {
  console.error('[opencode-mem] Error:', err.message);
  process.exit(1);
});
