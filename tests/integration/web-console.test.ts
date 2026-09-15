import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { get } from 'node:http';

const httpGet = (url: string, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; body: string }>((res, rej) => {
    get(url, { headers }, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => res({ status: r.statusCode ?? 0, body: b }));
    }).on('error', rej);
  });

it(
  'P4 只读Web控制台:本地HTTP适配器输出真实Core快照与响应式页面',
  { timeout: 60000 },
  async () => {
    mkdirSync('.local/w11-tests', { recursive: true });
    const dir = mkdtempSync(resolve('.local/w11-tests/web-'));
    mkdirSync(resolve(dir, 'workspace'), { recursive: true });
    cpSync('packages/storage/migrations', resolve(dir, 'migrations'), { recursive: true });
    await build({ entryPoints: ['apps/core-daemon/w11-main.ts'], outfile: resolve(dir, 'core.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external' });
    const core = spawn(process.execPath, [resolve(dir, 'core.mjs')], {
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
    await build({
      entryPoints: ['apps/web-console/main.mjs'],
      outfile: resolve(dir, 'web-server.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
    });
    const server = spawn(process.execPath, [resolve(dir, 'web-server.mjs'), resolve(dir, 'core'), '0'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { SystemRoot: process.env.SystemRoot },
    });
    let address = '';
    const out: string[] = [];
    server.stdout.on('data', (d) => {
      out.push(d.toString());
      const m = /"address":"http:\/\/127\.0\.0\.1:(\d+)"/.exec(d.toString());
      if (m) address = 'http://127.0.0.1:' + m[1];
    });
    server.stderr.on('data', (d) => out.push('ERR:' + d.toString()));
    try {
      for (let i = 0; i < 100 && !address; i++) await new Promise((r) => setTimeout(r, 100));
      if (!address) console.log('SERVER OUT:', JSON.stringify(out.join('')));
      expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const response = await httpGet(address + '/api/snapshot');
      expect(response.status).toBe(200);
      const snap = JSON.parse(response.body);
      expect(snap.connected).toBe(true);
      expect(snap.updatedAt).toBeGreaterThan(0);
      expect(typeof snap.dataId).toBe('string');
      expect(typeof snap.serverInstanceId).toBe('string');
      expect((await httpGet(address + '/api/snapshot', {host:'evil.test'})).status).toBe(403);
      expect((await httpGet(address + '/api/snapshot', {origin:'https://evil.test'})).status).toBe(403);
      expect((await fetch(address + '/api/snapshot', {method:'POST'})).status).toBe(405);
      expect(Array.isArray(snap.projects)).toBe(true);
      const page = (await httpGet(address + '/')).body;
      expect(page).toContain('AgentRouter 控制台');
      expect(page).toContain('viewport');
      expect(page).toContain('只读');
      expect(page).toContain('if (!response.ok)');
      expect(page).not.toContain('HEALTH ');
      expect(page).toContain('数据可能过期');
      const exited = new Promise<void>(r => core.once('exit', () => r()));
      core.kill();
      await exited;
      await new Promise(r => setTimeout(r, 1100));
      const unavailable = await httpGet(address + '/api/snapshot');
      expect(unavailable.status).toBe(503);
      expect(JSON.parse(unavailable.body)).toEqual({ error: 'CORE_UNAVAILABLE' });
    } finally {
      server.kill();
      core.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
  },
);
