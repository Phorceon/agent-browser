import { spawn } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';

const userDataDir = join(homedir(), 'Library/Application Support/Microsoft Edge');
const executablePath = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

const args = [
  '--remote-debugging-port=9222',
  '--profile-directory=Default',
  `--user-data-dir=${userDataDir}`,
];

const p = spawn(executablePath, args, { detached: true });
p.unref();
console.log("Spawned");
