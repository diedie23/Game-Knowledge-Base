import { spawn } from 'node:child_process';
import { openSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const directory = path.dirname(fileURLToPath(import.meta.url));
const log = openSync(path.join(directory, '_vite.log'), 'a');
const child = spawn(process.execPath, [path.join(directory, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5175'], {
  cwd: directory, detached: true, windowsHide: true, stdio: ['ignore', log, log],
});
child.unref();
writeFileSync(path.join(directory, '_vite.pid'), String(child.pid));
console.log('V2 preview PID:', child.pid);