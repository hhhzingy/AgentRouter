import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { StdioServerProxy } from '../../packages/client-transport/p1/stdio.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';

it(
  'P4 SSH桥:stdio帧经桥到本地Core,完成一次握手与读写(真实sshd由用户启用后同路径)',
  { timeout: 90000 },
  async () => {
    mkdirSync('.local/w11-tests', { recursive: true });
    const dir = mkdtempSync(resolve('.local/w11-tests/ssh-'));
    mkdirSync(resolve(dir, 'workspace'), { recursive: true });
    const core = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: '',
        TEMP: dir,
        TMP: dir,
        AGENTROUTER_DATA: resolve(dir, 'core'),
        AGENTROUTER_PROJECT_ROOTS: JSON.stringify([resolve(dir, 'workspace')]),
      },
    });
    for (let i = 0; i < 60 && !existsSync(resolve(dir, 'core/endpoint.json')); i++)
      await new Promise((r) => setTimeout(r, 100));
    // 桥与客户端都打包(bundle,生产同构)
    await build({
      entryPoints: ['apps/ssh-bridge/main.mjs'],
      outfile: resolve(dir, 'ssh-bridge.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
    });
    // 客户端经 StdioServerProxy 把桥子进程当作远端(本地 spawn 即 sshd forced command 的同构替身)
    const bridge = spawn(
      process.execPath,
      [resolve(dir, 'ssh-bridge.mjs'), resolve(dir, 'core')],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    try {
      const proxy = new StdioServerProxy(bridge.stdout, bridge.stdin);
      const transport = new P1MemoryTransport(proxy, 'remote_ssh_user');
      const s = await transport.connect({
        clientId: 'ssh_remote',
        clientVersion: '1.0.0-dev.0',
        requestedMode: 'observer',
        contractRevision: 'C1R1P1',
        mode: 'LOCAL_CORE',
      });
      expect(s.hello.contractRevision).toBe('C1R1P1');
      expect(s.hello.capabilities.mock).toBe(false);
      const snap = await s.request('system.snapshot', {});
      expect(Array.isArray(snap.projects)).toBe(true);
      // 观察者写权限拒绝(远端默认最小权限)
      await expect(
        s.request('project.create', { name: 'x', path_handle: 'y' } as never),
      ).rejects.toThrow();
      await transport.close();
    } finally {
      bridge.kill();
      core.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
  },
);
