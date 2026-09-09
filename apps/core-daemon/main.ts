import { openStore } from '../../packages/storage/index.ts';
import { Core } from '../../packages/runtime/core.ts';
import { Management } from '../../packages/runtime/management.ts';
import { JsonLfDecoder } from '../../packages/platform/framing.ts';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { RouteError } from '../../packages/protocol/index.ts';
const data = process.env.AGENTROUTER_DATA;
if (!data) throw Error('AGENTROUTER_DATA_REQUIRED');
mkdirSync(data, { recursive: true });
const db = openStore(
  resolve(data, 'router.db'),
  new URL('./migrations/001-baseline.sql', import.meta.url),
);
const core = new Core(db);
const management = new Management(db);
core.recover();
function snapshot() {
  return {
    ...core.snapshot(),
    projects: db.prepare('select * from projects').all(),
    spaces: db.prepare('select * from spaces').all(),
    workspaces: db.prepare('select * from workspaces').all(),
    bindings: db
      .prepare('select id,role_id,harness,epoch,is_current,capability_json from bindings')
      .all(),
    runtime: {
      node: process.version,
      processId: process.pid,
      sqlite: (db.prepare('select sqlite_version() as v').get() as { v: string }).v,
    },
    support: {
      codex: '仅探测；未完成真实验收',
      kimi_code: 'ACP v1 已探测；未完成真实验收',
      pi: 'RPC 已探测；未完成真实验收',
    },
  };
}
const decoder = new JsonLfDecoder();
process.stdin.on('data', (chunk) => {
  try {
    for (const req of decoder.push(chunk)) {
      try {
        let result;
        const input = req.params ?? {};
        switch (req.method) {
          case 'snapshot':
            result = snapshot();
            break;
          case 'createProject':
            result = management.createProject(input.name, input.path);
            break;
          case 'archiveProject':
            management.archiveProject(input.id);
            result = {};
            break;
          case 'createRole':
            result = management.createRole(input);
            break;
          case 'renameRole':
            management.renameRole(input.id, input.name);
            result = {};
            break;
          case 'setRoleStatus':
            management.setRoleStatus(input.id, input.status);
            result = {};
            break;
          case 'shutdown':
            db.close();
            process.stdout.write(JSON.stringify({ id: req.id, result: {} }) + '\n', () =>
              process.exit(0),
            );
            return;
          default:
            throw new RouteError('METHOD_NOT_ALLOWED', 'AUTHORIZATION');
        }
        process.stdout.write(JSON.stringify({ id: req.id, result }) + '\n');
      } catch (error) {
        process.stdout.write(
          JSON.stringify({
            id: req.id,
            error: error instanceof RouteError ? error.toJSON() : { code: 'INTERNAL_ERROR' },
          }) + '\n',
        );
      }
    }
  } catch {
    process.exitCode = 1;
    process.stdin.destroy();
  }
});
process.stdin.on('end', () => {
  if (db.open) db.close();
});
