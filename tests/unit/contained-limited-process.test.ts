import { it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startContainedLimitedProcess } from '../../packages/platform/contained-limited-process.ts';

const windows = it.skipIf(process.platform !== 'win32');
const supervisorExecutable = resolve('.local/native/agentrouter-supervisor.exe');
beforeAll(() => {
  if (process.platform !== 'win32') return;
  const built = spawnSync('powershell.exe', ['-NoProfile', '-File', resolve('tools/build-supervisor.ps1')], {
    windowsHide: true, encoding: 'utf8', timeout: 30000,
  });
  if (built.status !== 0) throw Error('SUPERVISOR_TEST_BUILD_FAILED');
});
async function fixture(args: string[], stopTimeoutMs = 3000) {
  const base = resolve('.local/contained-limited-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'case-'));
  const supervisorSha256 = createHash('sha256')
    .update(await readFile(supervisorExecutable))
    .digest('hex');
  const p = await startContainedLimitedProcess({
    executable: process.execPath,
    args,
    cwd: root,
    managedRoot: root,
    epoch: 9,
    supervisorExecutable,
    supervisorSha256,
    stopTimeoutMs,
  });
  return {
    p,
    root,
    cleanup: async () => {
      await p.stop();
      await p.closed;
      await rm(root, { recursive: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}
windows('EOF 后真实 Job 停止 Node 子及孙进程，幂等返回全树证据', async () => {
  const f = await fixture([
    '-e',
    `const {spawn}=require('node:child_process');
    const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    console.log(c.pid);process.stdin.resume();process.stdin.on('end',()=>process.exit(0));`,
  ]);
  try {
    const pid = Number(
      await new Promise<string>((resolve) => f.p.stdout.once('data', (b) => resolve(b.toString()))),
    );
    expect(pid).toBeGreaterThan(0);
    const proof = await f.p.stop();
    expect(proof).toEqual({
      kind: 'supervisor-tree-empty',
      epoch: 9,
      containmentId: f.p.containmentId,
    });
    expect(await f.p.stop()).toEqual(proof);
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    await f.cleanup();
  }
});
windows('超时杀 supervisor 只能返回 unknown', async () => {
  const f = await fixture(['-e', 'setInterval(()=>{},1000)'], 100);
  try {
    expect(await f.p.stop()).toEqual({ kind: 'unknown', epoch: 9 });
  } finally {
    await f.cleanup();
  }
});
windows('非零退出不能成为全树成功证据', async () => {
  const f = await fixture(['-e', 'process.exit(7)']);
  try {
    expect(await f.p.stop()).toEqual({ kind: 'unknown', epoch: 9 });
  } finally {
    await f.cleanup();
  }
});
windows('拒绝 supervisor hash 不匹配', async () => {
  await expect(
    startContainedLimitedProcess({
      executable: process.execPath,
      args: [],
      cwd: process.cwd(),
      managedRoot: resolve('.local'),
      epoch: 9,
      supervisorExecutable,
      supervisorSha256: '0'.repeat(64),
    }),
  ).rejects.toThrow('SUPERVISOR_HASH_MISMATCH');
});
