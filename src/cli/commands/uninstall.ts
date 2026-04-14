import fs from 'fs';
import path from 'path';
import os from 'os';

const PLUGIN_DIR = path.join(os.homedir(), '.config', 'opencode', 'plugins', 'open-mem');
const OPENCODE_CONFIG = path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc');
const MEMORY_DIR = path.join(os.homedir(), '.config', 'opencode', 'memory');

export async function uninstall() {
  console.log('[open-mem] Starting uninstallation...\n');

  try {
    // Step 1: Ask for confirmation
    console.log('This will remove open-mem plugin from Opencode.');
    console.log('Your memory data will NOT be deleted (stored at: ~/.config/opencode/memory)\n');

    // Step 2: Remove plugin directory
    console.log('[open-mem] Removing plugin files...');
    if (fs.existsSync(PLUGIN_DIR)) {
      fs.rmSync(PLUGIN_DIR, { recursive: true });
      console.log('         Removed:', PLUGIN_DIR);
    } else {
      console.log('         Plugin directory not found (already uninstalled?)');
    }

    // Step 3: Update opencode.jsonc config
    console.log('[open-mem] Updating Opencode config...');
    updateOpencodeConfig();

    console.log('\n[open-mem] ✅ Uninstallation complete!');
    console.log('\nNote: Your memory data is still at:');
    console.log('  ', MEMORY_DIR);
    console.log('\nTo fully remove, delete that directory manually.');
    
  } catch (err: any) {
    console.error('\n[open-mem] ❌ Uninstallation failed:', err.message);
    process.exit(1);
  }
}

function updateOpencodeConfig() {
  if (!fs.existsSync(OPENCODE_CONFIG)) {
    console.log('         Opencode config not found, skipping');
    return;
  }

  try {
    let configContent = fs.readFileSync(OPENCODE_CONFIG, 'utf-8');

    // Remove open-mem/plugin from the plugins array
    configContent = configContent.replace(/["']open-mem\/plugin["'],?\s*/g, '');

    // Clean up any double commas or trailing commas in arrays
    configContent = configContent.replace(/,\s*]/g, ']');
    configContent = configContent.replace(/\[\s*,/g, '[');

    fs.writeFileSync(OPENCODE_CONFIG, configContent, 'utf-8');
    console.log('         Updated:', OPENCODE_CONFIG);
  } catch (err) {
    console.warn('         Warning: Could not update config automatically.');
    console.warn('         Please manually remove "open-mem/plugin" from plugins array in:');
    console.warn('         ', OPENCODE_CONFIG);
  }
}
