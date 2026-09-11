import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('.local/management-live');
const data = resolve(root, 'core'),
  workspace = resolve(root, 'workspace');
mkdirSync(workspace, { recursive: true });
if (existsSync(resolve(data, 'endpoint.json'))) throw Error('EXISTING_CORE_CHECK_REQUIRED');
const child = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], {
  detached: true,
  windowsHide: true,
  stdio: 'ignore',
  env: {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: root,
    TMP: root,
    PATH: '',
    AGENTROUTER_DATA: data,
    AGENTROUTER_PROJECT_ROOTS: JSON.stringify([workspace]),
  },
});
child.unref();
for (let i = 0; i < 100 && !existsSync(resolve(data, 'endpoint.json')); i++)
  await new Promise((r) => setTimeout(r, 50));
if (!existsSync(resolve(data, 'endpoint.json'))) throw Error('CORE_START_FAILED');
writeFileSync(
  resolve(root, 'owner.json'),
  JSON.stringify(
    { pid: child.pid, data, workspace, purpose: 'J3-MCP-01', isolation: 'LIMITED_ISOLATION' },
    null,
    2,
  ),
);
console.log(JSON.stringify({ status: 'STARTED', pid: child.pid, data }));
