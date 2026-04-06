import { readFileSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CHROME_DATA = join(homedir(), 'Library/Application Support/Google/Chrome');
const EDGE_DATA = join(homedir(), 'Library/Application Support/Microsoft Edge');

console.log('\n=== Browser Profile Scan ===\n');

[
  { name: 'Google Chrome', path: CHROME_DATA },
  { name: 'Microsoft Edge', path: EDGE_DATA }
].forEach(browser => {
  if (!existsSync(browser.path)) return;

  console.log(`Checking ${browser.name}...`);

  const localStatePath = join(browser.path, 'Local State');
  let profileCache = {};
  if (existsSync(localStatePath)) {
    try {
      const localState = JSON.parse(readFileSync(localStatePath, 'utf8'));
      profileCache = localState?.profile?.info_cache || {};
    } catch (e) {}
  }

  const rawFolders = readdirSync(browser.path).filter(f => 
    f === 'Default' || f.startsWith('Profile ')
  );

  if (rawFolders.length === 0) return;

  console.log(`Found ${rawFolders.length} Profile folder(s):\n`);
  console.log('  #   Folder       Name                      Email');
  console.log('  ─'.repeat(65));

  const sorted = rawFolders.map(folder => {
    const info = profileCache[folder] || {};
    return { folder, name: info.name || folder, email: info.user_name || '(unknown)' };
  }).sort((a, b) => {
    if (a.folder === 'Default') return -1;
    if (b.folder === 'Default') return 1;
    const numA = parseInt(a.folder.replace('Profile ', '') || '0');
    const numB = parseInt(b.folder.replace('Profile ', '') || '0');
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
