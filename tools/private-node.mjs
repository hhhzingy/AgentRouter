import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const expected = '63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088';
const url = 'https://nodejs.org/download/release/v24.14.0/win-x64/node.exe';
const dest = '.local/runtime/node.exe';
mkdirSync('.local/runtime', { recursive: true });
const local = readFileSync(process.execPath);
if (createHash('sha256').update(local).digest('hex') === expected)
  copyFileSync(process.execPath, dest);
else {
  const response = await fetch(url);
  if (!response.ok) throw Error('NODE_DOWNLOAD_FAILED');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw Error('NODE_HASH_MISMATCH');
  writeFileSync(dest, bytes);
}
if (!existsSync('.local/runtime/LICENSE')) {
  const response = await fetch('https://raw.githubusercontent.com/nodejs/node/v24.14.0/LICENSE');
  if (!response.ok) throw Error('NODE_LICENSE_DOWNLOAD_FAILED');
  writeFileSync('.local/runtime/LICENSE', await response.text());
}
writeFileSync(
  'evidence/M00/private-node.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      version: '24.14.0',
      url,
      sha256: expected,
      checksumSource: 'https://nodejs.org/download/release/v24.14.0/SHASUMS256.txt',
      installed: dest,
    },
    null,
    2,
  ) + '\n',
);
console.log(dest);
