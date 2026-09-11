import { mkdirSync,mkdtempSync,writeFileSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn,execFileSync } from 'node:child_process';
import { build } from 'esbuild';
mkdirSync('.local/j3-codex-boundary',{recursive:true});
const root=mkdtempSync(resolve('.local/j3-codex-boundary/run-'));
const home=resolve(root,'home'),work=resolve(root,'work');
mkdirSync(resolve(home,'.codex'),{recursive:true});mkdirSync(work);
writeFileSync(resolve(home,'.codex/auth.json'),'{}'); // No real account is loaded.
const entries={profile:'packages/platform/codex-managed-profile.ts',bridge:'packages/role-bridge/native-server.ts',lifecycle:'packages/adapters/codex/lifecycle.ts'};
await build({entryPoints:entries,outdir:root,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external'});
const {prepareManagedCodexProfile}=await import(pathToFileURL(resolve(root,'profile.mjs')));
const {createNativeRoleBridge}=await import(pathToFileURL(resolve(root,'bridge.mjs')));
const {CodexLifecycle}=await import(pathToFileURL(resolve(root,'lifecycle.mjs')));
const bridge=await createNativeRoleBridge();
let toolCalls=0;
const token=bridge.issue(async()=>{toolCalls++;throw Error('PREFLIGHT_HAS_NO_ROLE');});
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const roleBridge=resolve('.local/w11-core/role-bridge.mjs');
const profile=prepareManagedCodexProfile({managedRoot:root,sessionHome:home,nodeExecutable:process.execPath,nodeSha256:sha(process.execPath),roleBridge,roleBridgeSha256:sha(roleBridge),bridgeEndpoint:bridge.endpoint,bridgeToken:token});
const supervisor=resolve(root,'supervisor.exe'),stop=resolve(root,'stop');
execFileSync(resolve(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+supervisor,resolve('native/windows-supervisor/Supervisor.cs')],{stdio:'pipe',windowsHide:true});
const exe='C:/Users/hap_p/AppData/Local/OpenAI/Codex/bin/7ac07f4ce733f89a/codex.exe';
const child=spawn(supervisor,['--stop-file',stop,work,exe,'app-server',...profile.extraArgs],{cwd:work,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,...profile.env,APPDATA:resolve(home,'AppData/Roaming'),LOCALAPPDATA:resolve(home,'AppData/Local')}});
child.stderr.resume();child.stdin.on('error',()=>{});
let closed=false;const close=new Promise(r=>child.once('close',code=>{closed=true;r(code);}));
const lifecycle=new CodexLifecycle({write:b=>new Promise((r,j)=>child.stdin.write(b,e=>e?j(Error('WRITE_FAILED')):r())),onEvent:()=>{},timeoutMs:15000});
child.stdout.on('data',b=>lifecycle.peer.accept(b));child.on('error',()=>lifecycle.peer.disconnect());
const report={scope:'NO_SECRET_CODEX_NATIVE_MCP_BOUNDARY',status:'FAIL',submittedTasks:0,realCredentialsLoaded:false,fullIsolationCertified:false,executableSha256:sha(exe)};
try{
 await lifecycle.initialize();
 const configuration=await lifecycle.peer.request('config/read',{cwd:work,includeLayers:false});
 report.shellDisabled=configuration.config?.features?.shell_tool===false;
 report.webDisabled=configuration.config?.web_search==='disabled';
 report.routeApprovalExplicit=['route_context','route_send','route_finish','route_wait','route_artifact_register','route_artifact_read'].every(t=>configuration.config?.mcp_servers?.['agentrouter-role']?.tools?.[t]?.approval_mode==='approve');
 if(!report.routeApprovalExplicit)throw Error('ROUTE_APPROVAL_CONFIG_NOT_EFFECTIVE');
 if(!report.shellDisabled||!report.webDisabled)throw Error('CODEX_TOOL_CONFIG_NOT_EFFECTIVE');
 const mcp=await lifecycle.peer.request('mcpServerStatus/list',{});
 report.serverNames=(mcp.data??[]).map(x=>/^[a-z0-9_-]+$/.test(x.name)?x.name:'REDACTED');
 if(mcp.nextCursor||report.serverNames.length!==1||report.serverNames[0]!=='agentrouter-role')throw Error('MCP_INVENTORY_MISMATCH');
 const expected=['route_context','route_send','route_finish','route_wait','route_artifact_register','route_artifact_read'].sort();
 report.tools=Object.keys(mcp.data[0].tools??{}).sort();
 if(JSON.stringify(report.tools)!==JSON.stringify(expected))throw Error('ROUTE_TOOLS_INVENTORY_MISMATCH');
 report.status='PASS';
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'CODEX_NATIVE_PREFLIGHT_FAILED';}
finally{
 bridge.revoke(token);lifecycle.peer.disconnect();
 writeFileSync(stop,'STOP',{flag:'wx'});child.stdin.end();
 let timer;const code=await Promise.race([close,new Promise(r=>{timer=setTimeout(()=>r(null),7000);})]);clearTimeout(timer);
 report.jobEmpty=closed&&code===0;report.toolCalls=toolCalls;
 if(!report.jobEmpty){report.status='FAIL';report.stop='UNCONFIRMED';child.kill();}
 await bridge.close();
 writeFileSync(resolve(root,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({root,...report}));
}
if(report.status!=='PASS')process.exitCode=1;
