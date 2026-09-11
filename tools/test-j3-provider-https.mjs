import { createServer } from 'node:https';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const dir = resolve(process.argv[2]);
await build({
  entryPoints: ['packages/security/approved-provider.ts'],
  outfile: resolve(dir, 'provider.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { ApprovedProvider } = await import(pathToFileURL(resolve(dir, 'provider.mjs')).href);
const checks = [];
for (const scenario of process.argv[3] === '--untrusted'
  ? ['untrusted']
  : ['timeout', 'overflow', 'redirect', 'success']) {
  let count = 0;
  const sockets = new Set();
  const server = createServer(
    { pfx: readFileSync(resolve(dir, 'server.pfx')), passphrase: '' },
    (req, res) => {
      count++;
      req.resume();
      if (scenario === 'timeout') {
        res.writeHead(200);
        res.write('{');
      }
      if (scenario === 'overflow') {
        res.writeHead(200);
        res.write('x'.repeat(2048));
      }
      if (scenario === 'redirect') {
        res.writeHead(302, { location: '/forbidden' });
        res.flushHeaders();
      }
      if (scenario === 'success') {
        res.end(JSON.stringify({ choices: [{ message: { content: 'synthetic' } }] }));
      }
    },
  );
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const provider = new ApprovedProvider(
      {
        origin: `https://localhost:${server.address().port}`,
        path: '/chat/completions',
        models: ['test'],
        timeoutMs: 300,
        maxResponseBytes: 1024,
      },
      async () => 'synthetic-credential-only',
    );
    const result = await provider.complete({
      model: 'test',
      messages: [{ role: 'user', content: 'dummy' }],
    });
    const expected = {
      timeout: 'TIMEOUT',
      overflow: 'RESPONSE_TOO_LARGE',
      redirect: 'UPSTREAM_REJECTED',
      untrusted: 'TRANSPORT_FAILED',
    }[scenario];
    if (expected) assert.deepEqual(result, { ok: false, code: expected });
    else assert.equal(result.ok, true);
    for (let n = 0; n < 50 && sockets.size; n++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(count, scenario === 'untrusted' ? 0 : 1);
    assert.equal(sockets.size, 0);
    checks.push({ scenario, status: 'PASS', requests: count, remainingSockets: sockets.size });
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
  }
}
const report = { scope: 'LOCAL_HTTPS_ACTUAL_SOCKET_FAKE_CREDENTIAL', realProvider: false, checks };
writeFileSync(
  resolve(dir, process.argv[3] === '--untrusted' ? 'untrusted-report.json' : 'report.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
