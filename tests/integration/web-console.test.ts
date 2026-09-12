import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { get } from 'node:http';

const httpGet = (url: string) =>
  new Promise<{ status: number; body: string }>((res, rej) => {
    get(url, (r) => {
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
      const snap = JSON.parse((await httpGet(address + '/api/snapshot')).body);
      expect(Array.isArray(snap.projects)).toBe(true);
      const page = (await httpGet(address + '/')).body;
      expect(page).toContain('AgentRouter 控制台');
      expect(page).toContain('viewport');
      expect(page).toContain('只读');
    } finally {
      server.kill();
      core.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
  },
);
