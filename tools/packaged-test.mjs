import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const packagePath = process.argv[2];
if (!packagePath) throw Error('EXPLICIT_PACKAGE_PATH_REQUIRED');
const dest = resolve(packagePath),
  manifest = JSON.parse(readFileSync(resolve(dest, 'manifest.json'), 'utf8'));
const expectedVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
assert.equal(expectedVersion, '1.1.0');
assert.equal(manifest.version, expectedVersion);
assert.equal(JSON.parse(readFileSync(resolve(dest, 'resources/app/package.json'), 'utf8')).version, expectedVersion);
for (const file of manifest.files) {
  const path = resolve(dest, file.path),
    rel = relative(dest, path);
  assert.ok(!rel.startsWith('..') && !isAbsolute(rel));
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), file.sha256);
}
assert.equal(
  createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex'),
  manifest.artifactHash,
);
assert.equal(manifest.fixtureEnabled, false);
assert.equal(manifest.backendMode, 'LOCAL_CORE');
assert.equal(manifest.sourceDirty, false);
assert.equal(manifest.sourceSHA, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
assert.deepEqual(Object.keys(manifest.mcpEntrypoints).sort(), ['management', 'participantHttp', 'participantStdio']);
for (const entry of Object.values(manifest.mcpEntrypoints)) assert.ok(existsSync(resolve(dest, entry)));
assert.equal(manifest.migrations.count, 20);
assert.equal(manifest.migrations.files.length, 20);
assert.deepEqual(
  manifest.harnessDrivers.map((x) => x.harness).sort(),
  ['codex', 'deepseek_harness', 'kimi_code', 'pi', 'zcode'],
);
for (const driver of manifest.harnessDrivers) {
  assert.equal(driver.driverVersion, 'source:' + manifest.sourceSHA);
  assert.equal(driver.contractRevision, 'C1R1P1');
  assert.match(driver.adapterSourceSha256, /^[a-f0-9]{64}$/);
  assert.match(driver.lifecycleSourceSha256, /^[a-f0-9]{64}$/);
}
for (const value of Object.values(manifest.runtimeVersions)) assert.ok(String(value).length > 0);
for (const value of Object.values(manifest.nativeAssets)) assert.match(value, /^[a-f0-9]{64}$/);
mkdirSync('.local/packaged-tests', { recursive: true });
const data = mkdtempSync(resolve('.local/packaged-tests/J3-中文 路径-'));
writeFileSync(resolve(data, 'fixture-data.marker'), 'AGENTROUTER_ISOLATED_FIXTURE');
await build({
  entryPoints: ['packages/client-transport/p1/local.ts'],
  outfile: resolve(data, 'transport.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { LocalCoreTransport } = await import(pathToFileURL(resolve(data, 'transport.mjs')).href);
const transport = new LocalCoreTransport(data);
const spawnCore = () => spawn(
    resolve(dest, 'resources/app/core-node.exe'),
    [resolve(dest, 'resources/w11-core/core.mjs')],
    {
    cwd: data,
    windowsHide: true,
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: '',
      TEMP: data,
      TMP: data,
      AGENTROUTER_DATA: data,
      AGENTROUTER_FIXTURE: '1',
      AGENTROUTER_PROJECT_ROOTS: JSON.stringify([data]),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
let child = spawnCore();
let failure = false,
  fixtureReply = false;
child.on('error', () => {
  failure = true;
});
child.stderr.on('data', () => {
  failure = true;
});
child.on('message', (message) => {
  if (message?.id === 'forbidden-fixture') fixtureReply = true;
});
let closed = new Promise((r) => child.once('close', r));

const report = {
  at: new Date().toISOString(),
  sourceSHA: manifest.sourceSHA,
  sourceDirty: manifest.sourceDirty,
  artifactHash: manifest.artifactHash,
  packagePath: dest,
  testScriptHash: createHash('sha256')
    .update(readFileSync(new URL(import.meta.url)))
    .digest('hex'),
  transportHash: createHash('sha256')
    .update(readFileSync(resolve(data, 'transport.mjs')))
    .digest('hex'),
  scope: '开发机新打包 Core/Node/SQLite 与真实 LocalCoreTransport；非真实 Harness/干净机认证',
  status: 'FAIL',
  checks: [],
};
try {
  const deadline = Date.now() + 15000;
  while (!existsSync(resolve(data, 'endpoint.json'))) {
    if (failure || child.exitCode !== null || Date.now() > deadline)
      throw Error('PACKAGED_CORE_START_FAILED');
    await new Promise((r) => setTimeout(r, 30));
  }
  const endpoint = JSON.parse(readFileSync(resolve(data, 'endpoint.json'), 'utf8'));
  assert.equal(endpoint.source, 'NATIVE_REGISTRY_BLOCKED_IMPLEMENTATION');
  report.checks.push('生产注册入口启动，无 Fixture fallback');
  const session = await transport.connect({
    clientId: 'j3-packaged',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'controller',
    mode: 'LOCAL_CORE',
  });
  assert.ok(session.hello.serverInstanceId);
  const context = await transport.desktopContext();
  assert.ok(context.dataId);
  report.checks.push('真实命名管道握手与 Desktop Context');
  child.send({ id: 'forbidden-fixture', action: 'seedAccount' });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(fixtureReply, false);
  assert.equal(
    JSON.parse(readFileSync(resolve(data, 'endpoint.json'), 'utf8')).source,
    'NATIVE_REGISTRY_BLOCKED_IMPLEMENTATION',
  );
  report.checks.push('环境变量 + marker + IPC 均不能启用 Fixture 控制');
  const snapshot = await session.request('system.snapshot', {});
  const lease = await session.request('control.acquire', {}, {
    operationId: 'packaged-lease', expectedRevision: snapshot.revision, scope: {},
  });
  const roots = await session.request('filesystem.listRoots', {});
  const project = await session.request('project.create', {
    name: 'PACKAGED-RESTART-READBACK', path_handle: roots.items[0].pathHandle,
  }, {
    operationId: 'packaged-project',
    expectedRevision: (await session.request('system.snapshot', {})).revision,
    scope: {}, leaseId: lease.leaseId,
  });
  await session.request('runtime.shutdownCore', {}, {
    operationId: 'packaged-shutdown',
    expectedRevision: (await session.request('system.snapshot', {})).revision,
    scope: {}, leaseId: lease.leaseId,
  }).catch(() => {});
  await closed;
  await transport.close();
  child = spawnCore();
  failure = false;
  closed = new Promise((r) => child.once('close', r));
  const restartDeadline = Date.now() + 15000;
  let restartedEndpoint = null;
  while (Date.now() < restartDeadline) {
    if (existsSync(resolve(data, 'endpoint.json'))) {
      const candidate = JSON.parse(readFileSync(resolve(data, 'endpoint.json'), 'utf8'));
      if (candidate.pid === child.pid) { restartedEndpoint = candidate; break; }
    }
    if (failure || child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(restartedEndpoint?.pid, child.pid);
  const restartedTransport = new LocalCoreTransport(data);
  const restartedSession = await restartedTransport.connect({
    clientId: 'j3-packaged-restart', clientVersion: '1.0.0-dev.0', requestedMode: 'observer', mode: 'LOCAL_CORE',
  });
  const projects = await restartedSession.request('project.list', {});
  assert.ok(projects.items.some((item) => item.id === project.id && item.name === 'PACKAGED-RESTART-READBACK'));
  const history = await restartedSession.request('conversation.read', { scope: { project_id: project.id }, limit: 100 });
  assert.ok(Array.isArray(history.items));
  await restartedTransport.close();
  report.checks.push('正式 shutdown 后同一数据目录重启，Project 与 history 可读');
  report.status = 'PASS';
} catch {
  report.error = 'PACKAGED_CHECK_FAILED';
  process.exitCode = 1;
} finally {
  await transport.close();
  child.kill();
  await closed;
  writeFileSync(resolve(data, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, reportPath: resolve(data, 'report.json') }, null, 2));
}
