import { toolDefinitions } from '../role-bridge/tool-definitions.mjs';
// Loaded only by explicit absolute --extension path. Never writes protocol stdout.
export default function routeTools(pi) {
  for (const { name, inputSchema, description } of toolDefinitions)
    pi.registerTool({
      name,
      label: name,
      description,
      parameters: inputSchema,
      async execute(toolCallId, input, signal) {
        const endpoint = process.env.AGENTROUTER_BRIDGE_ENDPOINT,
          token = process.env.AGENTROUTER_BRIDGE_TOKEN;
        if (!endpoint || !token) throw Error('BRIDGE_NOT_CONFIGURED');
        const url = new URL(endpoint);
        if (url.hostname !== '127.0.0.1' || url.pathname !== '/tools')
          throw Error('BRIDGE_BOUNDARY');
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tool: name, operation_id: toolCallId, input }),
          signal,
        });
        const value = await response.json();
        if (!response.ok || value.error) throw Error(value.error?.code ?? 'BRIDGE_FAILED');
        return { content: [{ type: 'text', text: JSON.stringify(value.result) }], details: {} };
      },
    });
}
