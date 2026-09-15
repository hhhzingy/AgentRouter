import { readFileSync } from 'node:fs';
import { request } from 'node:https';

// 只输出白名单模型名和状态；禁止输出响应正文、认证头或文件正文。
try {
  const file = process.argv[2];
  if (!file) throw Error('CREDENTIAL_PATH_REQUIRED');
  const text = readFileSync(file, 'utf8');
  const keys = [...new Set(text.match(/sk-[A-Za-z0-9_-]{16,}/g) ?? [])];
  const origins = (text.match(/https?:[^\s]+/g) ?? []).flatMap(s => { try { return [new URL(s).origin]; } catch { return []; } });
  if (keys.length !== 1 || !origins.includes('https://api.deepseek.com')) throw Error('AUTHORIZED_ORIGIN_UNVERIFIED');
  const result = await new Promise((resolve, reject) => {
    const req = request({ hostname: 'api.deepseek.com', path: '/models', method: 'GET', agent: false,
      rejectUnauthorized: true, signal: AbortSignal.timeout(20000), headers: { authorization: 'Bearer ' + keys[0] } }, async res => {
      try {
        if (res.statusCode !== 200) { res.destroy(); throw Error('PROBE_HTTP_REJECTED'); }
        let size = 0; const chunks = [];
        for await (const b of res) { size += b.length; if (size > 65536) { res.destroy(); throw Error('PROBE_TOO_LARGE'); } chunks.push(b); }
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw.includes(keys[0])) throw Error('PROBE_SECRET_REFLECTION');
        const body = JSON.parse(raw);
        if (!Array.isArray(body.data)) throw Error('PROBE_INVALID');
        resolve({ status: 'PASS', origin: 'https://api.deepseek.com', path: '/models',
          models: body.data.map(m => m.id).filter(id => typeof id === 'string' && /^deepseek[-a-zA-Z0-9.]{1,70}$/.test(id)),
          capacitySource: 'NOT_RETURNED_BY_MODELS_ENDPOINT', capturedAt: new Date().toISOString() });
      } catch { reject(Error('PROBE_RESPONSE_REJECTED')); }
    });
    req.once('error', () => reject(Error('PROBE_TRANSPORT_FAILED')));
    req.end();
  });
  console.log(JSON.stringify(result));
} catch (e) {
  console.log(JSON.stringify({ status: 'FAIL', code: e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'PROBE_FAILED' }));
  process.exitCode = 1;
}
