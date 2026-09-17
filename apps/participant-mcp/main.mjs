// WN03:Participant stdio 入口(业务在 participant-common 共享桥;本文件只做装配)。
// grant 必须由管理面签发(--grant/--grant-token 或受控 grant 文件);不再自签、不再直读 router.db。
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { resolveGrant, openParticipantBridge, buildParticipantServer } from './participant-common.mjs';

const data = process.argv[2], roleId = process.argv[3];
process.on('uncaughtException', (e) => { console.error('PARTICIPANT_CRASH:', String(e && (e.stack || e)).slice(0, 300)); process.exit(1); });
process.on('unhandledRejection', (e) => console.error('PARTICIPANT_REJECTION:', String(e && (e.message || e)).slice(0, 300)));
if (!data || !roleId || process.env.AGENTROUTER_MANAGED_ROLE !== '1') throw Error('PARTICIPANT_START_DENIED');
const grant = resolveGrant(data, roleId, process.argv);
const bridge = await openParticipantBridge({ data, roleId, grant });
console.error('participant attached, generation', bridge.info.generation);
const server = buildParticipantServer(Server, ListToolsRequestSchema, CallToolRequestSchema, bridge.call);
await server.connect(new StdioServerTransport());
process.stdin.on('end', () => { void bridge.close(); });
