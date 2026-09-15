import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
import { createSnapshotSource } from './snapshot-source.mjs';
// P4 v1 只读控制台:本机 127.0.0.1 HTTP 观察者;TLS/私网暴露由 Tailscale Serve 完成(用户执行)。
const data = process.argv[2];
const port = Number(process.argv[3] ?? 8787);
if (!data) throw Error('WEB_CONSOLE_DATA_REQUIRED');
const transport = new LocalCoreTransport(data);
const snapshot = createSnapshotSource(transport);
const page = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentRouter 控制台(只读)</title>
<style>
 body{font-family:system-ui,sans-serif;margin:0;background:#0f1420;color:#e8ecf4}
 header{padding:12px 16px;background:#161d2e;position:sticky;top:0;display:flex;gap:12px;align-items:baseline}
 h1{font-size:16px;margin:0} .host{font-size:12px;color:#8fa0b8}
 main{padding:12px;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
 section{background:#161d2e;border-radius:10px;padding:12px} h2{font-size:13px;margin:0 0 8px;color:#9fb3cc}
 table{width:100%;border-collapse:collapse;font-size:12px} td,th{padding:4px 6px;text-align:left;border-bottom:1px solid #232c40}
 .pill{font-size:11px;padding:2px 8px;border-radius:99px;background:#233152} .ok{background:#1d3a2a} .warn{background:#4a3a1d}
 footer{padding:8px 16px;font-size:11px;color:#66748c}
</style></head><body>
<header><h1>AgentRouter 控制台</h1><span class="pill" id="health">…</span><span class="host" id="host"></span></header>
<main>
 <section><h2>项目 / 空间</h2><table id="projects"></table></section>
 <section><h2>角色</h2><table id="roles"></table></section>
 <section><h2>任务</h2><table id="tasks"></table></section>
 <section><h2>运行</h2><table id="runs"></table></section>
</main>
<footer>只读观察者 · 自动刷新约 1.5s · 连接失败时保留旧数据并标记过期</footer>
<script>
 const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const rows = (el, cols, items) => { el.innerHTML = '<tr>' + cols.map((c) => '<th>' + c.label + '</th>').join('') + '</tr>' +
   items.map((it) => '<tr>' + cols.map((c) => '<td>' + esc(c.get(it)) + '</td>').join('') + '</tr>').join('') || '<tr><td>—</td></tr>'; };
 async function refresh() {
   try {
     const response = await fetch('/api/snapshot', {cache:'no-store', signal:AbortSignal.timeout(12000)});
     if (!response.ok) throw Error('CORE_UNAVAILABLE');
     const s = await response.json();
     if (s.connected !== true || !Number.isFinite(s.updatedAt) || !['projects','roles','tasks','runs'].every(k=>Array.isArray(s[k]))) throw Error('INVALID_SNAPSHOT');
     document.getElementById('health').textContent = 'Core 已连接';
     document.getElementById('host').textContent = '最近更新 ' + new Date(s.updatedAt).toLocaleTimeString();
     rows(document.getElementById('projects'), [{label:'项目',get:p=>p.name},{label:'状态',get:p=>p.status}], s.projects ?? []);
     rows(document.getElementById('roles'), [{label:'角色',get:r=>r.name},{label:'Harness',get:r=>r.harness},{label:'引导',get:r=>r.bootstrapState}], s.roles ?? []);
     rows(document.getElementById('tasks'), [{label:'任务',get:t=>t.summary},{label:'状态',get:t=>t.state}], s.tasks ?? []);
     rows(document.getElementById('runs'), [{label:'运行',get:r=>r.id?.slice(0,14)},{label:'状态',get:r=>r.state}], s.runs ?? []);
   } catch (e) { document.getElementById('health').textContent = '连接失败 · 数据可能过期'; }
   finally { setTimeout(refresh, 1500); }
 }
 refresh();
</script></body></html>`;
const server = createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  if (req.method !== 'GET') { res.writeHead(405, {allow:'GET'}).end(); return; }
  try {
    if (req.url === '/api/snapshot') {
      const payload = await snapshot();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page);
      return;
    }
    res.writeHead(404).end();
  } catch (error) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'CORE_UNAVAILABLE' }));
  }
});
server.listen(port, '127.0.0.1', () => {
  const bound = server.address();
  const actualPort = typeof bound === 'object' && bound ? bound.port : port;
  console.log(JSON.stringify({ status: 'STARTED', address: 'http://127.0.0.1:' + actualPort, scope: 'READ_ONLY_OBSERVER' }));
});
