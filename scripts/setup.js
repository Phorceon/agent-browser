import { readFileSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const platform = process.platform;
const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local');

function browserDataDir(name) {
  const lc = name.toLowerCase();
  if (platform === 'darwin') {
    const map = {
      chrome: 'Library/Application Support/Google/Chrome',
      edge: 'Library/Application Support/Microsoft Edge'
    };
    return map[lc] ? join(homedir(), map[lc]) : null;
  }
  if (platform === 'win32') {
    const map = {
      chrome: join(localAppData, 'Google/Chrome/User Data'),
      edge: join(localAppData, 'Microsoft/Edge/User Data')
    };
    return map[lc] || null;
  }
  if (platform === 'linux') {
    const map = {
      chrome: join(homedir(), '.config/google-chrome'),
      edge: join(homedir(), '.config/microsoft-edge')
    };
    return map[lc] || null;
  }
  return null;
}

console.log('\n=== Browser Profile Scan ===\n');

[
  { name: 'Google Chrome', key: 'chrome' },
  { name: 'Microsoft Edge', key: 'edge' }
].forEach(browser => {
  const browserPath = browserDataDir(browser.key);
  if (!browserPath) return;
  if (!existsSync(browserPath)) return;

  console.log(`Checking ${browser.name}...`);

  const localStatePath = join(browserPath, 'Local State');
  let profileCache = {};
  if (existsSync(localStatePath)) {
    try {
      const localState = JSON.parse(readFileSync(localStatePath, 'utf8'));
      profileCache = localState?.profile?.info_cache || {};
    } catch (e) {
      console.log(`  Warning: could not parse Local State: ${e.message}`);
    }
  }

  const rawFolders = readdirSync(browserPath).filter(f =>
    f === 'Default' || f.startsWith('Profile ')
  );

  if (rawFolders.length === 0) {
    console.log('  No profile folders found.\n');
    return;
  }

  console.log(`Found ${rawFolders.length} Profile folder(s):\n`);
  console.log('  #   Folder       Name                      Email');
  console.log('  ─'.repeat(65));

  const sorted = rawFolders.map(folder => {
    const info = profileCache[folder] || {};
    return { folder, name: info.name || folder, email: info.user_name || '(unknown)' };
  }).sort((a, b) => {
    if (a.folder === 'Default') return -1;
    if (b.folder === 'Default') return 1;
    const numA = parseInt(a.folder.replace('Profile ', ''), 10) || 0;
    const numB = parseInt(b.folder.replace('Profile ', ''), 10) || 0;
    return numA - numB;
  });

  sorted.forEach((p, i) => {
    const num = String(i + 1).padStart(2, ' ');
    const folder = p.folder.padEnd(13);
    const name = (p.name || '').padEnd(26).slice(0, 26);
    console.log(`  ${num}  ${folder}${name}${p.email}`);
  });
  console.log('\n' + '─'.repeat(65) + '\n');
});
