import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = resolve('.local/j3-supervisor');
mkdirSync(root, { recursive: true });
const executable = resolve('.local/native/agentrouter-supervisor.exe');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const sourceSha = spawnSync('git', ['-c', 'safe.directory=' + process.cwd(), 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
  windowsHide: true,
}).stdout.trim();
const report = {
  sourceSha,
  sourceDirty:
    spawnSync(
      'git',
      [
        '-c',
        'safe.directory=' + process.cwd(),
        'status',
        '--porcelain',
        '--',
        'native/windows-supervisor/Supervisor.cs',
        'tools/test-j3-supervisor.mjs',
      ],
      { encoding: 'utf8', windowsHide: true },
    ).stdout.trim().length > 0,
  testScriptHash: hash('tools/test-j3-supervisor.mjs'),
  supervisorSourceHash: hash('native/windows-supervisor/Supervisor.cs'),
  artifactHash: hash(executable),
  platform: process.platform,
  scope: 'WINDOWS_PROCESS_CONTAINMENT_ONLY',
  secretIsolation: 'NOT_TESTED',
  realHarnessSupport: 0,
  checks: [],
};
if (process.platform !== 'win32') throw Error('BLOCKED_ENV_WINDOWS_REQUIRED');
const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
  stdio: 'ignore',
  windowsHide: true,
});
try {
  for (const mode of ['parent-exits', 'helper-terminated'])
    for (let i = 0; i < 10; i++) {
      const dir = mkdtempSync(resolve(root, 'case-'));
      const marker = resolve(dir, 'heartbeat.txt'),
        pids = resolve(dir, 'pids.json');
      const childFile = resolve(dir, 'child.cjs');
      writeFileSync(
        childFile,
        `const {spawn}=require('node:child_process');const fs=require('node:fs');const grand=spawn(process.execPath,['-e',${JSON.stringify(`const fs=require('node:fs');setInterval(()=>fs.appendFileSync(${JSON.stringify(marker)},'.'),5);`)}],{stdio:'ignore',windowsHide:true});fs.writeFileSync(${JSON.stringify(pids)},JSON.stringify({parent:process.pid,grand:grand.pid}));${mode === 'parent-exits' ? 'setTimeout(()=>process.exit(0),200)' : 'setInterval(()=>{},1000)'};`,
      );
      const helper = spawn(executable, [dir, process.execPath, childFile], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
      });
      let closed = false;
      const done = new Promise((res, rej) => {
        helper.on('error', rej);
        helper.on('close', (code) => {
          closed = true;
          res(code);
        });
      });
      try {
        let ids;
        for (let j = 0; j < 200; j++) {
          try {
            ids = JSON.parse(readFileSync(pids, 'utf8'));
            break;
          } catch {
            await delay(10);
          }
        }
        assert(ids, 'child PID evidence missing');
        if (mode === 'helper-terminated') helper.kill();
        let timer;
        const code = await Promise.race([
          done,
          new Promise((_, rej) => {
            timer = setTimeout(() => rej(Error('SUPERVISOR_TIMEOUT')), 12000);
          }),
        ]).finally(() => clearTimeout(timer));
        if (mode === 'parent-exits') assert.equal(code, 0);
        if (mode === 'helper-terminated')
          for (let j = 0; j < 100 && (alive(ids.parent) || alive(ids.grand)); j++) await delay(10);
        assert(!alive(ids.parent), 'parent survived');
        assert(!alive(ids.grand), 'grandchild survived');
        const before = (() => {
          try {
            return readFileSync(marker).length;
          } catch {
            return 0;
          }
        })();
        await delay(30);
        const after = (() => {
          try {
            return readFileSync(marker).length;
          } catch {
            return 0;
          }
        })();
        assert.equal(after, before);
        assert(alive(unrelated.pid), 'unrelated process affected');
        report.checks.push({
          mode,
          iteration: i + 1,
          status: 'PASS',
          childStopped: true,
          grandchildStopped: true,
          lateWrites: false,
          unrelatedPreserved: true,
        });
      } finally {
        if (!closed) {
          helper.kill();
          await done;
        }
      }
    }
} catch (e) {
  report.failure = e.message;
  process.exitCode = 1;
} finally {
  unrelated.kill();
  mkdirSync('evidence/J3/J3-02', { recursive: true });
  writeFileSync(
    'evidence/J3/J3-02/windows-supervisor.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      checks: report.checks.length,
      status: report.failure ? 'FAIL' : 'PASS',
      realHarnessSupport: 0,
    }),
  );
}
