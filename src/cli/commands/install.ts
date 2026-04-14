import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getOpenCodeConfigDir, getPluginDir, getMemoryDir } from '../../utils/platform.js';

const PLUGIN_DIR = getPluginDir();
const OPENCODE_CONFIG = path.join(getOpenCodeConfigDir(), 'opencode.jsonc');

export async function install() {
  console.log('[opencode-mem] Starting installation...\n');

  try {
    // Step 1: Check if Opencode config exists
    if (!fs.existsSync(path.dirname(OPENCODE_CONFIG))) {
      console.error('[opencode-mem] Error: Opencode config directory not found.');
      console.error('         Is Opencode installed?');
      process.exit(1);
    }

    // Step 2: Create plugin directory
    console.log('[opencode-mem] Creating plugin directory...');
    if (!fs.existsSync(PLUGIN_DIR)) {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      console.log('         Created:', PLUGIN_DIR);
    } else {
      console.log('         Plugin directory already exists (will update):', PLUGIN_DIR);
    }

    // Step 3: Get the source dist directory (where open-mem is installed)
    const sourceDist = path.join(process.cwd(), 'dist');
    
    if (!fs.existsSync(sourceDist)) {
      console.error('[opencode-mem] Error: dist/ directory not found.');
      console.error('         Please run "npm run build" first.');
      process.exit(1);
    }

    // Step 4: Copy dist files to plugin directory
    console.log('[opencode-mem] Copying plugin files...');
    copyDirRecursive(sourceDist, PLUGIN_DIR);
    console.log('         Copied dist/* →', PLUGIN_DIR);

    // Step 5: Create plugin subdirectory structure
    const pluginSubdir = path.join(PLUGIN_DIR, 'plugin');
    if (!fs.existsSync(pluginSubdir)) {
      fs.mkdirSync(pluginSubdir, { recursive: true });
    }

    // Copy index.js to plugin/index.js (the main entry point)
    const mainIndex = path.join(PLUGIN_DIR, 'index.js');
    const pluginIndex = path.join(pluginSubdir, 'index.js');
    
    if (fs.existsSync(mainIndex)) {
      fs.copyFileSync(mainIndex, pluginIndex);
      console.log('         Copied index.js → plugin/index.js');
    }

    // Step 6: Install dependencies in plugin directory
    console.log('[opencode-mem] Installing dependencies...');
    try {
      execSync('npm install', {
        cwd: PLUGIN_DIR,
        stdio: 'inherit'
      });
      console.log('         Dependencies installed');
    } catch (err) {
      console.warn('         Warning: npm install failed, trying with --legacy-peer-deps');
      try {
        execSync('npm install --legacy-peer-deps', {
          cwd: PLUGIN_DIR,
          stdio: 'inherit'
        });
      } catch (e) {
        console.warn('         Warning: Could not install dependencies automatically.');
        console.warn('         Please run: cd', PLUGIN_DIR, '&& npm install');
      }
    }

    // Step 7: Update opencode.jsonc config
    console.log('[opencode-mem] Updating Opencode config...');
    updateOpencodeConfig();
    console.log('         Updated:', OPENCODE_CONFIG);

    // Step 8: Verify installation
    console.log('\n[opencode-mem] Verifying installation...');
    verifyInstallation();

    console.log('\n[opencode-mem] ✅ Installation complete!');
    console.log('\nNext steps:');
    console.log('  1. Restart Opencode');
    console.log('  2. The plugin will auto-load');
    console.log('  3. Memory data will be stored at:');
    console.log('    ', getMemoryDir());
    
  } catch (err: any) {
    console.error('\n[opencode-mem] ❌ Installation failed:', err.message);
    process.exit(1);
  }
}

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function updateOpencodeConfig() {
  const configPath = OPENCODE_CONFIG;
  let configContent = '';

  if (fs.existsSync(configPath)) {
    configContent = fs.readFileSync(configPath, 'utf-8');
  } else {
    configContent = '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugin": []\n}';
  }

  // Check if open-mem/plugin already in config
  if (configContent.includes('open-mem/plugin')) {
    console.log('         open-mem/plugin already in config');
    return;
  }

  // Parse and update config
  try {
    // Simple JSONC parsing - find the plugins array
    const pluginsMatch = configContent.match(/"plugin"\s*:\s*\[([^\]]*)\]/);
    
    if (pluginsMatch) {
      const existingPlugins = pluginsMatch[1].trim();
      let newPlugins;
      
      if (existingPlugins === '') {
        newPlugins = '"opencode-mem/plugin"';
      } else {
        // Check if last item has trailing comma
        newPlugins = existingPlugins.endsWith(',') 
          ? existingPlugins + ' "opencode-mem/plugin"'
          : existingPlugins + ', "opencode-mem/plugin"';
      }
      
      configContent = configContent.replace(
        /"plugin"\s*:\s*\[[^\]]*\]/,
        `"plugin": [${newPlugins}]`
      );
    } else {
      // No plugins array found, add one
      configContent = configContent.replace(
        /\{/,
        '{\n  "plugin": ["opencode-mem/plugin"]'
      );
    }

    fs.writeFileSync(configPath, configContent, 'utf-8');
  } catch (err: any) {
    console.warn('         Warning: Could not install dependencies automatically.');
    console.warn('         Please run: cd', PLUGIN_DIR, '&& npm install');
  }
}

function verifyInstallation() {
  const checks = [
    { path: path.join(PLUGIN_DIR, 'index.js'), name: 'Plugin index.js' },
    { path: path.join(PLUGIN_DIR, 'plugin', 'index.js'), name: 'Plugin entry' },
    { path: path.join(PLUGIN_DIR, 'storage'), name: 'Storage module' },
    { path: path.join(PLUGIN_DIR, 'search'), name: 'Search module' },
  ];

  let allPassed = true;
  for (const check of checks) {
    if (fs.existsSync(check.path)) {
      console.log('         ✅', check.name);
    } else {
      console.log('         ❌', check.name, '- NOT FOUND');
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.warn('\n         Warning: Some files missing');
  }
}
