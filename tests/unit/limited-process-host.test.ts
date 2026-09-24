import { expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startLimitedProcess } from '../../packages/platform/limited-process-host.ts';

it('真实子进程使用独立 HOME、空 MCP 配置且不继承开发环境', async () => {
  const base = resolve('.local/limited-host-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'test-'));
  const previous = process.env.AGENTROUTER_TEST_SECRET;
  process.env.AGENTROUTER_TEST_SECRET = 'fake-canary-not-a-secret';
  let p: Awaited<ReturnType<typeof startLimitedProcess>> | undefined;
  try {
    p = await startLimitedProcess({
      executable: process.execPath,
      cwd: root,
      managedRoot: root,
      epoch: 7,
      args: [
        '-e',
        'process.stdin.on("data",b=>process.stdout.write(JSON.stringify({env:process.env,input:b.toString()})));',
      ],
    });
    const output = new Promise<string>((resolve) =>
      p!.stdout.once('data', (b) => resolve(b.toString())),
    );
    await p.write(Buffer.from('ping'));
    const observed = JSON.parse(await output);
    expect(observed.input).toBe('ping');
    expect(observed.env.HOME).toBe(p.home);
    expect(observed.env.CODEX_HOME).toBe(join(p.home, '.codex'));
    expect(observed.env.AGENTROUTER_MANAGED_ROLE).toBe('1');
    expect(observed.env.AGENTROUTER_TEST_SECRET).toBeUndefined();
    expect(observed.env.NODE_OPTIONS).toBeUndefined();
    expect(observed.env.PATH).toBe(join(p.home, 'bin'));
    expect(await readFile(join(p.home, '.codex', 'config.toml'), 'utf8')).not.toContain(
      'mcp_servers',
    );
    expect(await p.stop()).toEqual({ kind: 'unknown', epoch: 7 });
    await p.closed;
    expect(await p.stop()).toEqual({ kind: 'unknown', epoch: 7 });
  } finally {
    if (p) {
      await p.stop();
      await p.closed;
    }
    if (previous === undefined) delete process.env.AGENTROUTER_TEST_SECRET;
    else process.env.AGENTROUTER_TEST_SECRET = previous;
    await rm(root, { recursive: true, maxRetries: 10, retryDelay: 100 });
  }
});

it('拒绝相对路径和无效 epoch', async () => {
  await expect(
    startLimitedProcess({ executable: 'node', args: [], cwd: '.', managedRoot: '.', epoch: 1 }),
  ).rejects.toThrow('LIMITED_PROCESS_INPUT_INVALID');
});
