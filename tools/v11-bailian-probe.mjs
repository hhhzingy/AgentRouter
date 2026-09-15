import { readFileSync } from 'node:fs';
import { request } from 'node:https';
// 百炼(DashScope/MaaS)端点探测:仅输出脱敏绑定结论;key/Authorization/正文绝不外显。
// §4/§6:先 1 个小 chat,再 1 个受控 tool-calling 往返;不猜 endpoint/模型,失败记真实分类。
const file = process.argv[2];
if (!file) throw Error('CREDENTIAL_PATH_REQUIRED');
const text = readFileSync(file, 'utf8');
const keys = [...new Set(text.match(/sk-[A-Za-z0-9_-]{10,}/g) ?? [])];
const origins = [...new Set((text.match(/https?:\/\/[^\s"']+/g) ?? []).map(s => { try { return new URL(s).origin; } catch { return null; } }).filter(Boolean))];
if (keys.length !== 1) { console.log(JSON.stringify({ status: 'BLOCKED_PROVIDER_BINDING', reason: 'KEY_CARDINALITY', keyCount: keys.length })); process.exit(0); }
if (origins.length < 1) { console.log(JSON.stringify({ status: 'BLOCKED_PROVIDER_BINDING', reason: 'ENDPOINT_MISSING' })); process.exit(0); }
const origin = new URL(origins[0]);
// 兼容模式:优先原 origin;若标准 dashscope 用 /compatible-mode/v1,专有 MaaS 工作空间常直接挂 /v1 或 /compatible-mode/v1。
const bases = [origin.origin + '/compatible-mode/v1', origin.origin + '/v1', origin.origin];
function call(baseUrl, body) {
  return new Promise((resolve) => {
    const u = new URL(baseUrl + '/chat/completions');
    const payload = JSON.stringify(body);
    const req = request({ hostname: u.hostname, path: u.pathname, method: 'POST', rejectUnauthorized: true,
      signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), authorization: 'Bearer ' + keys[0] } },
      async res => {
        let size = 0; const chunks = [];
        for await (const b of res) { size += b.length; if (size > 300000) { res.destroy(); return resolve({ http: res.statusCode, err: 'TOO_LARGE' }); } chunks.push(b); }
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ http: res.statusCode, body: raw.includes(keys[0]) ? '[SECRET_REDACTED]' : raw });
      });
    req.once('error', e => resolve({ http: 0, err: (e.code || 'NET').toString() }));
    req.end(payload);
  });
}
async function models(base) {
  const u = new URL(base + '/models');
  return new Promise(res => { const r = request({ hostname: u.hostname, path: u.pathname, method: 'GET', rejectUnauthorized: true, signal: AbortSignal.timeout(20000), headers: { authorization: 'Bearer ' + keys[0] } }, async x => { let s = 0; const c = []; for await (const b of x) { s += b.length; if (s > 300000) { x.destroy(); return res({ http: x.statusCode, ids: [] }); } c.push(b); } try { const j = JSON.parse(Buffer.concat(c).toString('utf8')); res({ http: x.statusCode, ids: (j.data || j.models || []).map(m => m.id).filter(Boolean) }); } catch { res({ http: x.statusCode, ids: [] }); } }); r.once('error', () => res({ http: 0, ids: [] })); r.end(); });
}
const out = { status: 'PROBE', origin: origin.host, triedBases: [], models: [], chat: 'UNKNOWN', toolCalling: 'UNKNOWN', apiType: 'unknown' };
let chosen = null, modelIds = [];
for (const base of bases) {
  const mm = await models(base);
  out.triedBases.push({ base, http: mm.http, modelCount: mm.ids.length });
  if (mm.http === 200 && mm.ids.length) { chosen = base; modelIds = mm.ids; break; }
}
if (!chosen) { out.status = 'BLOCKED_PROVIDER_BINDING'; out.reason = 'NO_MODELS_ENDPOINT_200'; console.log(JSON.stringify(out)); process.exit(0); }
out.apiType = 'openai-compatible';
// 选一个模型:优先 qwen*;否则首个
const model = modelIds.find(m => /qwen.*(max|plus|turbo)/i.test(m)) || modelIds.find(m => /qwen/i.test(m)) || modelIds[0];
out.model = model; out.modelCount = modelIds.length; out.modelIdsSample = modelIds.slice(0, 8);
// 小 chat(极小 max_tokens)
const c = await call(chosen, { model, messages: [{ role: 'user', content: 'reply with the single word: ok' }], max_tokens: 8, temperature: 0 });
if (c.http === 200) { try { const j = JSON.parse(c.body); out.chat = j.choices?.[0]?.message?.content ? 'PASS' : 'EMPTY'; } catch { out.chat = 'PARSE'; } }
else out.chat = 'HTTP_' + (c.http || c.err || 'ERR');
// 受控 tool-calling 往返:一个必调工具
const tc = await call(chosen, { model, messages: [{ role: 'user', content: 'Use the get_time tool now.' }], max_tokens: 64, temperature: 0,
  tools: [{ type: 'function', function: { name: 'get_time', description: 'Return current time', parameters: { type: 'object', properties: {}, required: [] } } }], tool_choice: 'auto' });
let toolCalled = false; try { const j = JSON.parse(tc.body); toolCalled = !!j.choices?.[0]?.message?.tool_calls?.length; out.toolCalling = toolCalling ? 'PASS' : 'NO_TOOLCALL'; } catch { out.toolCalling = 'PARSE_OR_HTTP_' + (tc.http || 'ERR'); }
out.status = out.chat === 'PASS' ? (out.toolCalling === 'PASS' ? 'PASS' : 'PARTIAL_NO_TOOLCALL') : 'BLOCKED_PROVIDER_BINDING';
console.log(JSON.stringify(out));
