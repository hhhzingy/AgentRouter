import { it, expect, onTestFinished } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { WindowsNativeProcessHost } from '../../packages/platform/windows-native-process-host.ts';
const windows = it.skipIf(process.platform !== 'win32');
windows(
  '持久绑定 HOME、真实 STDIO 与 Job 收尾；保存回调原样接线',
  async () => {
    const base = resolve('.local/windows-native-tests');
    await mkdir(base, { recursive: true });
    const root = await mkdtemp(join(base, 'case-'));
    onTestFinished(async () => {
      await rm(root, { recursive: true, maxRetries: 10, retryDelay: 100 });
    });
    const home = join(root, 'home');
    await mkdir(home);
    const supervisorExecutable = join(root, 'agentrouter-supervisor.exe');
    const compiler = join(
      process.env.WINDIR ?? 'C:/Windows',
      'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
    );
    const compiled = spawnSync(
      compiler,
      [
        '/nologo',
        '/platform:x64',
        '/target:exe',
        `/out:${supervisorExecutable}`,
        resolve('native/windows-supervisor/Supervisor.cs'),
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    if (compiled.error || compiled.status !== 0)
      throw Error('BLOCKED_ENV_SUPERVISOR_COMPILER_UNAVAILABLE_OR_FAILED');
    const sha = async (p: string) =>
      createHash('sha256')
        .update(await readFile(p))
        .digest('hex');
    await writeFile(
      join(root, 'app-server'),
      `process.stdin.on('data',()=>console.log(JSON.stringify({home:process.env.HOME,codex:process.env.CODEX_HOME,managed:process.env.AGENTROUTER_MANAGED_ROLE,canary:process.env.TEST_SECRET})));`,
    );
    let saved = false,
      revoked = 0,
      disposed = 0;
    const host = new WindowsNativeProcessHost({
      isolation: 'LIMITED_ISOLATION',
      managedRoot: root,
      supervisorExecutable,
      supervisorSha256: await sha(supervisorExecutable),
      prepare: async () => ({
        env: { SystemRoot: process.env.SystemRoot },
        revoke: () => {
          revoked++;
        },
        dispose: async () => {
          disposed++;
        },
        zcodeModelSelection: { providerId: 'account:test', modelId: 'GLM-5.3' },
        saveSession: async () => {
          saved = true;
        },
      }),
    });
    const input = {
      config: {
        harness: 'codex' as const,
        executable: process.execPath,
        executableSha256: await sha(process.execPath),
        version: 'test',
        profileRef: 'test',
        providerId: 'test',
        modelId: 'test',
        effort: 'off',
        workspace: root,
        sessionHome: home,
        charterHash: 'test',
      },
      key: 'test',
      bindingId: 'test',
      epoch: 1,
      args: ['app-server'],
      effectivePermissions: {},
      handleTool: async () => ({}),
    };
    const p = await host.start(input);
    try {
      expect(p.zcodeModelSelection).toEqual({ providerId: 'account:test', modelId: 'GLM-5.3' });
      const received = new Promise<any>((resolve) =>
        p.onData((b) => resolve(JSON.parse(b.toString()))),
      );
      await p.write(Buffer.from('ping\n'));
      expect(await received).toEqual({ home, codex: join(home, '.codex'), managed: '1' });
      await p.saveSession({ id: 'test' }, { bindingId: 'test', epoch: 1, isCurrent: () => true });
      expect(saved).toBe(true);
      expect((await p.stop()).kind).toBe('supervisor-tree-empty');
      expect(revoked).toBeGreaterThan(0);
      await new Promise((r) => setImmediate(r));
      expect(disposed).toBe(1);
      const second = await host.start(input);
      expect((await second.stop()).kind).toBe('supervisor-tree-empty');
      await expect(host.start({ ...input, args: ['--eval', 'bad'] })).rejects.toThrow(
        'WINDOWS_NATIVE_HOST_INPUT_INVALID',
      );
      await expect(
        host.start({ ...input, config: { ...input.config, sessionHome: root } }),
      ).rejects.toThrow('WINDOWS_NATIVE_HOME_OUTSIDE_MANAGED_ROOT');
    } finally {
      await p.stop();
    }
  },
  30000,
);
