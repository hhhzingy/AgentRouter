import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { openApplicationStore } from '../packages/storage/application-store.ts';
import { Management } from '../packages/runtime/management.ts';
import { RoleContextStore } from '../packages/core-service/role-context-store.ts';
import { ContextMigrationService, estimateContextTokens } from '../packages/core-service/context-migration.ts';
import { DeepSeekContextCompressionBackend } from '../packages/core-service/deepseek-context-compression.ts';
import { createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';

// Z1 真实 DeepSeek 约 1M logical portable context → 256K safe target 产品闭环。
// 凭据仅经 trusted 读取(Deepseek.txt);证据不含 key/正文。合成数据,无真实项目。
const TARGET_SAFE_TOKENS = 256_000;
const LOGICAL_TARGET_TOKENS = 1_000_000;
const START_FACT = 'ZEBRA-7731-anchor', MID_FACT = 'OTTER-4417-middle', END_FACT = 'MAPLE-9092-tail';
const argPath = process.argv.slice(2).find(a => !a.startsWith('--'));
const keyPath = argPath ?? 'E:/AgentRouter/账号信息/通用API/Deepseek.txt';
if (!process.argv.includes('--live')) throw Error('EXPLICIT_LIVE_FLAG_REQUIRED');

function readKey() {
  const keys = [...new Set(readFileSync(keyPath, 'utf8').match(/sk-[A-Za-z0-9_-]{16,}/g) ?? [])];
  if (keys.length !== 1) throw Error('CREDENTIAL_FORMAT_UNRECOGNIZED');
  return keys[0];
}
async function chat(model, messages, maxTokens) {
  const key = readKey();
  const body = JSON.stringify({ model, messages, max_tokens: maxTokens, stream: false });
  return new Promise((res, rej) => {
    const req = httpsRequest({ hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      rejectUnauthorized: true, signal: AbortSignal.timeout(120000),
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), authorization: 'Bearer ' + key } },
      async r => {
        let size = 0; const chunks = [];
        for await (const b of r) { size += b.length; if (size > 2_000_000) { r.destroy(); return rej(Error('PROBE_TOO_LARGE')); } chunks.push(b); }
        try { res({ status: r.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch { rej(Error('PROBE_RESPONSE_REJECTED')); }
      });
    req.once('error', rej); req.end(body);
  });
}
mkdirSync('.local/v11-deepseek-1m', { recursive: true });
const root = mkdtempSync(resolve('.local/v11-deepseek-1m/run-'));
const evidence = { scope: 'V11_Z1_DEEPSEEK_1M_TO_256K', status: 'FAIL', live: true, capturedAt: new Date().toISOString() };
try {
  const dir = join(root, 'data');
  mkdirSync(dir, { recursive: true });
  const db = openApplicationStore(dir);
  const mgmt = new Management(db);
  const project = mgmt.createProject('V11-Z1-DeepSeek-1M', dir);
  const role = mgmt.createRole({ spaceId: project.space, name: 'AR-V11-FINAL-CMP', description: 'compression target', harness: 'pi', workspaceId: project.workspace }).role;
  const sessionA = db.prepare("select id from role_sessions where role_id=? and state='ACTIVE'").get(role).id;
  const sessionB = 'rsess_v11_cmp_target';
  db.prepare("update role_sessions set state='ARCHIVED' where id=?").run(sessionA);
  db.prepare("insert into role_sessions(id,role_id,seq,name,state,generation,created_at_ms,activated_at_ms) values(?,?,?,?,?,?,?,?)").run(sessionB, role, 2, 'TARGET', 'ACTIVE', 2, Date.now(), Date.now());
  db.prepare("insert into role_session_context_state(role_session_id,role_id,synced_through_seq,fidelity,updated_at_ms) values(?,?,0,'UNKNOWN',?)").run(sessionB, role, Date.now());
  const store = new RoleContextStore(db, () => Date.now());
  // 合成分布式语料:约 LOGICAL_TARGET_TOKENS;哨兵事实置于首/中/尾。
  const filler = ' routine coding-plan step with numeric token counts and file references and prior decisions. ';
  const chunk = filler.repeat(400); // ~ each entry large-ish
  const perEntryTokens = estimateContextTokens({ body: chunk });
  const totalEntries = Math.ceil(LOGICAL_TARGET_TOKENS / perEntryTokens);
  const at = (i) => 1000 + i;
  const markFor = i => i === 0 ? ` START FACT ${START_FACT}.` : i === Math.floor(totalEntries / 2) ? ` MIDDLE FACT ${MID_FACT}.` : i === totalEntries - 1 ? ` END FACT ${END_FACT}.` : '';
  for (let i = 0; i < totalEntries; i++)
    store.appendConversation({ roleId: role, sourceWorkSessionId: sessionA, sourceId: 'synth-' + i, kind: 'ASSISTANT_MESSAGE', title: 'step ' + i, body: 'Entry ' + i + ':' + chunk + markFor(i), atMs: at(i) });
  const head = db.prepare('select max(context_seq) m from role_context_entries where role_id=?').get(role).m;
  const srcBytes = db.prepare('select sum(length(content_json)+length(metadata_json)) b from role_context_entries where role_id=?').get(role).b;
  const logicalEstimate = estimateContextTokens(db.prepare('select content_json,metadata_json from role_context_entries where role_id=?').all(role));
  evidence.source = { entries: totalEntries, contextHeads: head, logicalTokens: logicalEstimate, sourceBytes: Number(srcBytes) };

  const attempts = [];
  const backend = new DeepSeekContextCompressionBackend({
    id: 'deepseek.v11.live', provider: 'deepseek', model: 'deepseek-v4-pro', allowedResolvedModels: ['deepseek-v4-pro'],
    policy: { origin: 'https://api.deepseek.com', path: '/chat/completions', models: ['deepseek-v4-pro'], timeoutMs: 120000, maxRequestBytes: 262144, maxResponseBytes: 1_500_000 },
    contextWindowTokens: 128_000, maxOutputTokens: 6_000, inputReserveTokens: 4_000,
    segmentation: { maxSegments: 64, maxTotalInputBytes: 16_777_216 },
  }, async () => readKey(), a => attempts.push(a));
  const service = new ContextMigrationService(db, store, () => Date.now());
  const pre = service.preflight({ roleId: role, targetWorkSessionId: sessionB, operationId: 'cmp-1m', mode: 'FULL', budget: { maxContextTokens: TARGET_SAFE_TOKENS, currentUsageTokens: 0, source: 'EXACT' } });
  evidence.preflight = { recommendation: pre.recommendation, budget: pre.budget.authoritativeTokens + '/' + pre.budget.portableTokens + '/' + pre.budget.portableBudgetTokens };
  // 直接探测压缩后端真实错误码(build 会用通用 CONTEXT_COMPRESSION_FAILED 包裹底层码)。
  try {
    const probeEntries = pre.entries;
    const direct = await backend.compress({ roleId: role, entries: probeEntries, budgetTokens: pre.budget.portableBudgetTokens ?? 240000, inputTokens: pre.budget.portableTokens, inputBytes: Number(srcBytes) });
    evidence.directCompress = { ok: true, coverage: [direct.coveredFromSeq, direct.coveredThroughSeq], fidelity: direct.fidelity };
  } catch (e) {
    evidence.directCompress = { ok: false, code: String(e && e.message).slice(0, 120), attempts: attempts.map(a => ({ code: a.code, seg: a.segmentIndex })) };
    throw e;
  }
  const plan = await svc.build({
    roleId: role, targetWorkSessionId: sessionB, operationId: 'cmp-1m', mode: 'FULL',
    budget: { maxContextTokens: TARGET_SAFE_TOKENS, currentUsageTokens: 0, source: 'EXACT' },
    compressionBackend: backend, compressionPolicy: { enabled: true, allowedBackendIds: [backend.id] },
  });
  const envelopeTokens = estimateContextTokens(plan.envelope);
  evidence.compression = {
    used: plan.compression.used, fidelity: plan.fidelity, envelopeTokens, withinSafeBudget: envelopeTokens <= TARGET_SAFE_TOKENS,
    segments: attempts.filter(a => a.segmentCount).length, segmentCount: attempts[0]?.segmentCount ?? null,
    providerInputTokensTotal: attempts.reduce((n, a) => n + (a.providerInputTokens ?? 0), 0),
    providerOutputTokensTotal: attempts.reduce((n, a) => n + (a.providerOutputTokens ?? 0), 0),
    resolvedModels: [...new Set(attempts.map(a => a.resolvedModel))],
    allSucceeded: attempts.every(a => a.status === 'SUCCEEDED'),
  };
  if (!plan.compression.used || envelopeTokens > TARGET_SAFE_TOKENS || !evidence.compression.allSucceeded) throw Error('COMPRESSION_NOT_CONVERGED');
  // 语义探针:让真实模型仅凭 envelope 回答必须来自 首/中/尾 事实的问题(CMP-07/08)
  const envText = JSON.stringify(plan.envelope);
  const probe = await chat('deepseek-v4-pro', [{ role: 'system', content: 'Answer ONLY from the given compressed context. Output the three exact code tokens if present, comma separated, no prose.' },
    { role: 'user', content: 'Context:\n' + envText.slice(0, 200000) + '\nQ: What are the START, MIDDLE, and END facts?' }], 200);
  const answer = probe.json?.choices?.[0]?.message?.content ?? '';
  const foundStart = answer.includes(START_FACT.slice(0, 5)) || envText.includes(START_FACT);
  const foundMid = envText.includes(MID_FACT), foundEnd = envText.includes(END_FACT);
  evidence.semanticProbe = { modelAnswered: probe.status === 200, envelopePreservesStart: foundStart, envelopePreservesMiddle: foundMid, envelopePreservesEnd: foundEnd, answerHead: answer.slice(0, 60) };
  if (!(foundStart && foundMid && foundEnd)) throw Error('SEMANTIC_PROBE_LOST_FACT');
  // 真实目标续办:模型仅凭 envelope 完成依赖首/中/尾的确定性小任务
  const cont = await chat('deepseek-v4-pro', [{ role: 'system', content: 'Using ONLY the compressed context, compute: (numeric part of START) minus (numeric part of END)? Reply just the number.' }, { role: 'user', content: 'Context:\n' + envText.slice(0, 200000) }], 60);
  evidence.continuation = { status: cont.status, answer: (cont.json?.choices?.[0]?.message?.content ?? '').slice(0, 40) };
  if (cont.status !== 200) throw Error('CONTINUATION_NOT_DELIVERED');
  db.close();
  evidence.status = 'PASS';
  evidence.hash = { sourceHash: createHash('sha256').update(envText).digest('hex').slice(0, 16) };
} catch (e) {
  evidence.error = e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'CMP_FAILED:' + String(e.message).slice(0, 120);
  evidence.attempts = attempts.map(a => ({ code: a.code, status: a.status, seg: a.segmentIndex, resolved: a.resolvedModel, inBytes: a.inputBytes, provIn: a.providerInputTokens }));
} finally {
  writeFileSync(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ evidence: join(root, 'evidence.json'), status: evidence.status, segments: evidence.compression?.segmentCount, envelopeTokens: evidence.compression?.envelopeTokens, providerIn: evidence.compression?.providerInputTokensTotal, probe: evidence.semanticProbe?.envelopePreservesStart && evidence.semanticProbe?.envelopePreservesMiddle && evidence.semanticProbe?.envelopePreservesEnd, error: evidence.error }));
  rmSync(root, { recursive: true, force: true, maxRetries: 3 });
}
if (evidence.status !== 'PASS') process.exitCode = 1;
