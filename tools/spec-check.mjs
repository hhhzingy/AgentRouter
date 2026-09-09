import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const temp = resolve('.local/tmp');
mkdirSync(temp, { recursive: true });
const result = spawnSync(
  'python',
  [
    'docs/执行包/AgentRouter_V1.0功能与开发手册包/tools/validate_spec.py',
    '--report',
    'evidence/M00/spec-validation.json',
  ],
  { stdio: 'inherit', env: { ...process.env, TEMP: temp, TMP: temp } },
);
process.exitCode = result.status ?? 1;
