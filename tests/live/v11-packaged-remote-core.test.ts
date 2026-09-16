import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import WebSocket from 'ws';

// W09:真实打包芯核对——esbuild 产出的 core.mjs 以 REMOTE_CORE opt-in 环境变量启动,
// 手机控制台资产、共享元数据路由与网关生命周期均通过子进程边界验证。
it(
  'W09 core.mjs REMOTE opt-in:网关随 core 启动/关停,console 与 /meta.js 由打包资产提供',
  async () => {
    mkdirSync('.local/v11-packaged-remote', { recursive: true });
    const data = mkdtempSync(resolve('.local/v11-packaged-remote/data-'));
    const coreEntry = resolve('.local/w11-core/core.mjs');
    if (!existsSync(coreEntry)) throw Error('BUILD_W11_CORE_REQUIRED');
    const port = 44567;
    const child = spawn(process.execPath, [coreEntry], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: '',
        TEMP: data,
        TMP: data,
        AGENTROUTER_DATA: data,
        AGENTROUTER_PROJECT_ROOTS: JSON.stringify([data]),
        AGENTROUTER_REMOTE_ENABLED: '1',
        AGENTROUTER_REMOTE_HOST: '127.0.0.1',
        AGENTROUTER_REMOTE_PORT: String(port),
        AGENTROUTER_REMOTE_ALLOWED_HOSTS: '127.0.0.1',
      },
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += String(d)));
    try {
      for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) throw Error('CORE_EXITED_EARLY:' + (stderr.slice(0, 200) || child.exitCode));
        if (existsSync(resolve(data, 'remote-gateway.json'))) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const info = JSON.parse(readFileSync(resolve(data, 'remote-gateway.json'), 'utf8')) as {
        enabled: boolean;
        host: string;
        port: number;
      };
      expect(info).toMatchObject({ enabled: true, host: '127.0.0.1', port });
      const health = await fetch(`http://127.0.0.1:${port}/health`, { headers: { host: '127.0.0.1' } });
      expect(health.status).toBe(200);
      const meta = await fetch(`http://127.0.0.1:${port}/meta.js`, { headers: { host: '127.0.0.1' } });
      const metaText = await meta.text();
      expect(metaText).toContain('window.METHOD_METADATA');
      expect(metaText).toContain('"control.acquire":true');
      const home = await fetch(`http://127.0.0.1:${port}/`, { headers: { host: '127.0.0.1' } });
      expect(await home.text()).toContain('AgentRouter 远程控制台');
      // 无 cookie + 坏 token → 4003;auth_required 提示先于关闭
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { host: '127.0.0.1' } });
      const got: string[] = [];
      const closeCode = await new Promise<number>((res) => {
        ws.on('message', (d) => {
          const s = String(d);
          got.push(s.slice(0, 40));
          if (s.includes('auth_required')) ws.send(JSON.stringify({ remote_token: 'bogus' }) + '\n');
        });
        ws.on('close', (c) => res(c));
      });
      expect(got.some((m) => m.includes('auth_required'))).toBe(true);
      expect(closeCode).toBe(4003);
      // 关停:core 退出即网关端口不可达
      child.kill('SIGTERM');
      await new Promise((r) => (child.once('exit', r), setTimeout(r, 8000)));
      // Windows 强杀:exitCode 可能为 null 而 signalCode 有值;两者之一即视为已退出。
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      await expect(
        fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000), headers: { host: '127.0.0.1' } }),
      ).rejects.toBeTruthy();
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  },
  90_000,
);
