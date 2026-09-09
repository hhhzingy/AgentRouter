import { spawn } from 'node:child_process';
import { piEntry } from './pi-location.mjs';
const child = spawn(process.execPath, [piEntry(), ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
