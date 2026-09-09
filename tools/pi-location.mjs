import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
export function piEntry() {
  const appData = process.env.APPDATA;
  if (!appData) throw Error('WINDOWS_APPDATA_UNAVAILABLE');
  const entry = resolve(
    appData,
    'npm/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',
  );
  if (!existsSync(entry)) throw Error('USER_PI_NOT_INSTALLED');
  return entry;
}
