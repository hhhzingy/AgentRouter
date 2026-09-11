import { createServer } from 'node:net';
import { createHash, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { FixtureDriver } from '../../packages/core-service/fixture-driver.ts';
import { ExecutionCoordinator } from '../../packages/core-service/execution-coordinator.ts';
import { NativeBackend, NativeExecutionRegistry } from '../../packages/core-service/native-registry.ts';
import { JsonLfDecoder } from '../../packages/platform/framing.ts';
import { installLocalNativeRuntime } from '../../packages/platform/local-native-runtime.ts';
const input = process.env.AGENTROUTER_DATA;
if (!input) throw Error('AGENTROUTER_DATA_REQUIRED');
mkdirSync(input, { recursive: true });
const data = realpathSync(input);
if (process.platform !== 'win32') throw Error('WINDOWS_CORE_ONLY_THIS_STAGE');
const principal =
  'human_' + createHash('sha256').update(userInfo().username).digest('hex').slice(0, 24);
const address =
  '\\\\.\\pipe\\AgentRouter-' +
  createHash('sha256')
    .update(data.toLowerCase() + principal)
    .digest('hex')
    .slice(0, 32);
const credential = randomBytes(32).toString('hex');
let application: ApplicationService,
  driver: ExecutionCoordinator,
  closing = false,
  dropNext = false;
const sockets = new Set<import('node:net').Socket>();
let nativeRuntime: Awaited<ReturnType<typeof installLocalNativeRuntime>> | undefined;
function send(socket: import('node:net').Socket, value: unknown) {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > 262144) {
    socket.destroy();
    return;
  }
  socket.write(encoded + '\n');
}
const fixtureReadCounts:Record<string,number>={};
let fixtureHistoryDelay=0,fixtureFailHistory=false,fixtureDenyMutation=false;
const server = createServer((socket) => {
  sockets.add(socket);
  const decoder = new JsonLfDecoder();
  let connection: string | undefined;
  let chain = Promise.resolve();
  socket.on('data', (chunk) => {
    try {
      const frames = decoder.push(chunk);
      for (const frame of frames)
        chain = chain
          .then(async () => {
            if (!connection) {
              if (
                typeof frame.credential !== 'string' ||
                frame.credential.length !== credential.length ||
                !timingSafeEqual(Buffer.from(frame.credential), Buffer.from(credential))
              ) {
                socket.destroy();
                return;
              }
              connection = application.open(principal, true);
              application.subscribe(connection, (event) => send(socket, event));
              send(socket, { attached: true });
              return;
            }
            if (frame.desktop_context === true) {
              send(socket,{v:1,id:frame.id,result:application.desktopContext(connection)});return;
            }
            if (typeof frame.desktop_directory === 'string') {
              try {
                send(socket, {
                  v: 1,
                  id: frame.id,
                  result: application.grantSelectedDirectory(connection, frame.desktop_directory),
                });
              } catch {
                send(socket, {
                  v: 1,
                  id: frame.id,
                  error: { code: 'SCOPE_DENIED', category: 'AUTHORIZATION' },
                });
              }
              return;
            }
            if(application.fixtureMode&&typeof frame.method==='string'){
              fixtureReadCounts[frame.method]=(fixtureReadCounts[frame.method]??0)+1;
              if(fixtureDenyMutation&&frame.operation_id&&!frame.method.startsWith('control.')){fixtureDenyMutation=false;send(socket,{v:1,id:frame.id,error:{code:'INVALID_PARAMS',category:'VALIDATION'}});return;}
              if(['conversation.read','roleCharter.get'].includes(frame.method)){
                if(fixtureHistoryDelay)await new Promise(r=>setTimeout(r,fixtureHistoryDelay));
                if(frame.method==='conversation.read'&&fixtureFailHistory){fixtureFailHistory=false;send(socket,{v:1,id:frame.id,error:{code:'INTERNAL_ERROR',category:'INTERNAL'}});return;}
              }
            }
            const response = await application.handle(connection, frame);
            if (dropNext && frame.operation_id && !String(frame.method).startsWith('control.')) {
              dropNext = false;
              return;
            }
            send(socket, response);
          })
          .catch((error) => {
            process.stderr.write(
              'LOCAL_REQUEST_REJECTED:' + String(error?.code ?? 'INVALID_REQUEST') + '\n',
            );
            socket.destroy();
          });
    } catch {
      socket.destroy();
    }
  });
  socket.on('close', () => {
    sockets.delete(socket);
    if (connection) application?.disconnect(connection);
  });
  socket.on('error', () => {});
});
server.on('error', (error) => {
  process.stderr.write(
    (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      ? 'CORE_ALREADY_RUNNING\n'
      : 'CORE_ENDPOINT_FAILED\n',
  );
  process.exitCode = 2;
  if (process.connected) process.disconnect();
});
async function shutdown() {
  if (closing) return;
  closing = true;
  await driver?.stop();
  await nativeRuntime?.close();
  for (const socket of sockets) socket.destroy();
  server.close(() => {
    application?.db.close();
    process.exit(0);
  });
}
server.listen(address, async () => {
  try {
    const fixture = process.env.AGENTROUTER_FIXTURE === '1';
    if (
      fixture &&
      (!existsSync(resolve(data, 'fixture-data.marker')) ||
        readFileSync(resolve(data, 'fixture-data.marker'), 'utf8') !==
          'AGENTROUTER_ISOLATED_FIXTURE')
    )
      throw Error('FIXTURE_DATA_MARKER_REQUIRED');
    const roots = JSON.parse(
      process.env.AGENTROUTER_PROJECT_ROOTS ?? JSON.stringify([data]),
    ) as string[];
    const db = openApplicationStore(data, new URL('./migrations/', import.meta.url));
    application = new ApplicationService(db, roots, fixture);
    if (fixture) {
      driver = new FixtureDriver(application,fileURLToPath(new URL('./fixture-harness.mjs', import.meta.url)));
    } else {
      const registry = new NativeExecutionRegistry(db);
      if (process.env.AGENTROUTER_NATIVE_CONFIG)
        nativeRuntime = await installLocalNativeRuntime(application,registry,process.env.AGENTROUTER_NATIVE_CONFIG);
      application.nativeAuthorization = (binding) => registry.authorized(binding);
      application.nativeCancelAvailable = (binding) => binding ? registry.canCancel(binding) : registry.anyCancel();
      application.nativeToolAuthorization = (binding,epoch,tool) => registry.toolAuthorized(binding,epoch,tool);
      driver = new ExecutionCoordinator(application,new NativeBackend(registry));
      // Native runtime is explicit opt-in; configuration is not a Harness certification.
    }
    application.onShutdown = () => void shutdown();
    writeFileSync(
      resolve(data, 'endpoint.json'),
      JSON.stringify({
        address,
        credential,
        pid: process.pid,
        instance: application.instanceId,
        mode: 'LOCAL_CORE',
        source: fixture ? 'SIMULATED_EXECUTOR' : nativeRuntime ? 'NATIVE_LIMITED_ISOLATION' : 'NATIVE_REGISTRY_BLOCKED_IMPLEMENTATION',
      }),
      { mode: 0o600 },
    );
    process.send?.({ ready: true, pid: process.pid, instance: application.instanceId });
    driver.kick();
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : 'CORE_START_FAILED') + '\n');
    server.close();
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
});
// IPC channel exists only when a trusted isolated test launcher forks this process. Never exposed over Client API or preload.
process.on('message', async (message: any) => {
  if (!application?.fixtureMode || !process.send) return;
  try {
    let result: unknown = {};
    if (message.action === 'configureFixture') {
      driver.configure(message.roleId, message.scenario);
    } else if (message.action === 'createFixtureWorkspace') {
      if (!application.one('select id from projects where id=?', message.projectId))
        throw Error('INVALID_FIXTURE_PROJECT');
      const id = 'workspace_' + randomUUID(),
        path = resolve(data, id);
      mkdirSync(path);
      const real = realpathSync(path);
      application.db
        .prepare('insert into workspaces values(?,?,?,?,?,?,?,?,?)')
        .run(id, message.projectId, null, real, real.toLowerCase(), 'MAIN', null, null, 'READY');
      result = { id };
    } else if (message.action === 'shareFixtureAuthUnit') {
      if (
        !Array.isArray(message.roleIds) ||
        message.roleIds.length < 1 ||
        message.roleIds.length > 6
      )
        throw Error('INVALID_FIXTURE_ROLES');
      const id = 'auth_fixture_' + randomUUID();
      application.db
        .transaction(() => {
          application.db
            .prepare('insert into auth_units values(?,?,?,?,?,?)')
            .run(id, 'codex', null, resolve(data, id), 1, 'READY');
          for (const role of message.roleIds) {
            application.roleScope(role);
            if (
              application.one('select id from initialization_attempts where role_id=?', role) ||
              application.one('select id from runs where role_id=?', role)
            )
              throw Error('FIXTURE_ALREADY_STARTED');
            application.db
              .prepare('update bindings set auth_unit_id=? where role_id=? and is_current=1')
              .run(id, role);
          }
        })
        .immediate();
      result = { id };
    } else if (message.action === 'createFixtureArtifact') {
      const resultRow = application.one(
        "select r.*,t.space_id,s.project_id from results r join tasks t on t.id=r.task_id join spaces s on s.id=t.space_id where r.publication_state='PUBLISHED' order by r.created_at_ms desc limit 1",
      );
      if (!resultRow) throw Error('FIXTURE_RESULT_REQUIRED');
      const bytes = Buffer.from('J1 isolated artifact\n'),
        sha = createHash('sha256').update(bytes).digest('hex'),
        id = 'artifact_' + randomUUID();
      mkdirSync(resolve(data, 'artifacts'), { recursive: true });
      writeFileSync(resolve(data, 'artifacts', sha), bytes);
      application.db
        .transaction(() => {
          application.db
            .prepare('insert into artifacts values(?,?,?,?,?,?,?,?,?)')
            .run(
              id,
              resultRow.project_id,
              sha,
              sha,
              bytes.length,
              'text/plain',
              JSON.stringify({ path: 'j1-result.txt', source: 'SIMULATED' }),
              'AVAILABLE',
              Date.now(),
            );
          application.db
            .prepare('update results set outputs_json=? where id=?')
            .run(JSON.stringify([{ type: 'artifact', id }]), resultRow.id);
          application.event(resultRow.project_id, 'FixtureArtifact', id);
        })
        .immediate();
      application.notify();
      result = { id, sha256: sha, byteSize: bytes.length };
    } else if(message.action==='seedHistory'){
      const scope=application.roleScope(message.roleId);
      const insert=application.db.prepare('insert into conversation_items(id,project_id,space_id,role_id,kind,title,body,at_ms,source_key) values(?,?,?,?,?,?,?,?,?)');
      application.db.transaction(()=>{for(let i=0;i<150;i++){const id='j2_history_'+randomUUID();insert.run(id,scope.project_id,scope.space_id,message.roleId,i===75?'GAP':'ASSISTANT_MESSAGE',String(message.label)+' 历史 '+i,i===75?'对话存在缺口：隔离测试':String(message.label)+' 第 '+i+' 条 **核验结论**\n```ts\nconst evidence = '+i+';\n```\n<script>window.hiddenInjected=true</script>',Date.now()+i,id);}})();
      application.event(scope.project_id,'FixtureHistory',message.roleId);application.notify();result={count:150};
    } else if(message.action==='denyNextMutation'){fixtureDenyMutation=true;result={configured:true};
    } else if(message.action==='historyFault'){
      fixtureHistoryDelay=Math.min(Math.max(Number(message.delayMs)||0,0),2000);fixtureFailHistory=message.fail===true;result={configured:true};
    } else if(message.action==='requestCounts'){
      result={...fixtureReadCounts};
    } else if(message.action==='burstEvents'){
      const scope=application.roleScope(message.roleId);
      for(let i=0;i<100;i++){application.event(scope.project_id,'FixturePulse',message.roleId);application.notify();}result={events:100};
    } else if (message.action === 'dropNextReply') {
      dropNext = true;
    } else if (message.action === 'failNextCommit') {
      application.failNextCommit = true;
    } else if (message.action === 'inspect') {
      result = {
        initializations: application.all('select * from initialization_attempts'),
        deliveries: application.all('select * from bootstrap_deliveries'),
        runs: application.all('select * from runs'),
        sources: application.all('select * from run_sources'),
        leases: application.all('select * from resource_leases'),
        initializationLeases: application.all('select * from initialization_leases'),
        messages: application.all('select * from messages'),
        outbox: application.all('select * from outbox'),
        tasks: application.all('select * from tasks'),
        ledger: application.all('select principal,client_id,operation_id from command_ledger'),
        audit: application.all('select kind from application_audit'),
      };
    } else throw Error('TEST_ACTION_UNAVAILABLE');
    process.send({ id: message.id, result });
  } catch (error) {
    process.send({ id: message.id, error: error instanceof Error ? error.message : 'TEST_FAILED' });
  }
});
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
