import { spawnSync } from 'node:child_process';
const commands = [
  ['tools/generate-client-contract.mjs', '--check'],
  ['tools/check-client-freeze.mjs'],
  ['tools/generate-client-c1r1.mjs', '--check'],
  ['tools/check-client-c1r1-freeze.mjs'],
  ['tools/generate-client-p1.mjs', '--check'],
  ['tools/check-client-p1-freeze.mjs'],
  ['tools/check-sensitive.mjs', '--staged'],
  ['tools/check-sensitive.mjs', '--history'],
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    'tests/unit',
    'tests/integration',
    'tests/contract',
    'tests/chaos',
    'tests/ui',
  ],
  ['tools/generate-j2-role-validator.mjs','--check'],
  ['tools/build-w11.mjs'],
  ['tools/test-b0-desktop.mjs'],
  ['tools/test-w11-desktop.mjs'],
  ['tools/test-j1-desktop.mjs'],
  ['tools/test-j2-desktop.mjs'],
];
for (const args of commands) {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
