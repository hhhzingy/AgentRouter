import { randomUUID } from 'node:crypto';
import { toolDefinitions } from './tool-definitions.mjs';
let pending = Buffer.alloc(0),
  initialized = false;
const responses = new Map();
const operations = new Map();
const session = randomUUID();
async function request(message) {
  if (!message.id && message.id !== 0) return;
  const previous = responses.get(message.id);
  if (previous) {
    if (previous.request !== JSON.stringify(message)) throw Error('REQUEST_ID_CONFLICT');
    process.stdout.write(previous.response + '\n');
    return;
  }
  let result;
  if (message.method === 'initialize') {
    if (initialized) throw Error('ALREADY_INITIALIZED');
    initialized = true;
    result = {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'agentrouter-role-bridge', version: '1.0.0-dev.0' },
    };
  } else if (!initialized) throw Error('NOT_INITIALIZED');
  else if (message.method === 'ping') result = {};
  else if (message.method === 'tools/list') result = { tools: toolDefinitions };
  else if (message.method === 'tools/call') {
    const name = message.params?.name;
    if (!toolDefinitions.some((t) => t.name === name)) throw Error('METHOD_NOT_ALLOWED');
    const endpoint = process.env.AGENTROUTER_BRIDGE_ENDPOINT,
      token = process.env.AGENTROUTER_BRIDGE_TOKEN;
    if (!endpoint || !token) throw Error('BRIDGE_NOT_CONFIGURED');
    const url = new URL(endpoint);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/tools') throw Error('BRIDGE_BOUNDARY');
    const operation = operations.get(message.id) ?? `mcp_${session}_${message.id}`;
    operations.set(message.id, operation);
    // HTTP ambiguity is surfaced; this bridge never retries with a fresh operation ID.
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tool: name,
        operation_id: operation,
        input: message.params.arguments ?? {},
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    result = body.error
      ? { isError: true, content: [{ type: 'text', text: JSON.stringify(body.error) }] }
      : { content: [{ type: 'text', text: JSON.stringify(body.result) }] };
  } else throw Error('METHOD_NOT_ALLOWED');
  const response = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
  responses.set(message.id, { request: JSON.stringify(message), response });
  process.stdout.write(response + '\n');
}
let queue = Promise.resolve();
process.stdin.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  let end;
  while ((end = pending.indexOf(10)) >= 0) {
    const bytes = pending.subarray(0, end);
    pending = pending.subarray(end + 1);
    if (bytes.length > 262144) {
      process.exitCode = 1;
      process.stdin.destroy();
      return;
    }
    let message;
    try {
      message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      process.exitCode = 1;
      process.stdin.destroy();
      return;
    }
    queue = queue
      .then(() => request(message))
      .catch((error) => {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32603, message: String(error.message) },
          }) + '\n',
        );
      });
  }
  if (pending.length > 262144) {
    process.exitCode = 1;
    process.stdin.destroy();
  }
});
