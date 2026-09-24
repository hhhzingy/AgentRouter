import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import Database from 'better-sqlite3';
const root=realpathSync(process.argv[2]);
const rel=relative(realpathSync('.local/j3-production-pi'),root);
if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('DIAGNOSTIC_SCOPE');
const db=new Database(resolve(root,'core/router.db'),{readonly:true});
const row=db.prepare('select n.config_json,s.session_ref,n.binding_id,n.epoch from native_binding_configs n join native_sessions s on s.binding_id=n.binding_id').get();db.close();
const config=JSON.parse(row.config_json),session=JSON.parse(row.session_ref);
if(config.harness!=='kimi_code')throw Error('KIMI_REQUIRED');
await build({entryPoints:['packages/platform/windows-native-process-host.ts','packages/adapters/kimi/lifecycle.ts'],outdir:resolve(root,'diagnostic'),outbase:'packages',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
const {WindowsNativeProcessHost}=await import(pathToFileURL(resolve(root,'diagnostic/platform/windows-native-process-host.mjs')));
const {KimiLifecycle}=await import(pathToFileURL(resolve(root,'diagnostic/adapters/kimi/lifecycle.mjs')));
const supervisor=resolve(root,'supervisor.exe');
const host=new WindowsNativeProcessHost({isolation:'LIMITED_ISOLATION',managedRoot:resolve(root,'managed'),supervisorExecutable:supervisor,
  supervisorSha256:createHash('sha256').update(readFileSync(supervisor)).digest('hex'),
  prepare:async()=>({env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,KIMI_CODE_NO_AUTO_UPDATE:'1',KIMI_DISABLE_TELEMETRY:'1',KIMI_DISABLE_CRON:'1'},saveSession:async()=>{throw Error('DIAGNOSTIC_NO_SESSION_WRITE');}}),
});
const p=await host.start({config,key:'diagnostic-load',bindingId:row.binding_id,epoch:row.epoch,args:['acp'],effectivePermissions:{},handleTool:async()=>{throw Error('DIAGNOSTIC_NO_TOOLS');}});
const report={scope:'KIMI_LOAD_NO_MODEL_TASK',submittedTasks:0,status:'FAIL',errors:[]};
const life=new KimiLifecycle({epoch:String(row.epoch),write:b=>p.write(b),onEvent:()=>{}});
let pending='';
p.onData(b=>{
  pending+=b.toString();
  while(pending.includes('\n')) {const end=pending.indexOf('\n'),line=pending.slice(0,end);pending=pending.slice(end+1);
    try {const f=JSON.parse(line);if(f.error){const message=JSON.stringify(f.error).toLowerCase();report.errors.push({code:f.error.code,messageLength:typeof f.error.message==='string'?f.error.message.length:null,hasData:f.error.data!==undefined,safeMessage:/^(?:[A-Za-z]{1,15} ){2,9}[A-Za-z]{1,15}$/.test(f.error.message)?f.error.message:undefined,categories:['unknown session','session not found','not found','invalid','mcp','config','cwd','directory','workspace','permission','tools','agent','file','authentication','login','oauth','expired','credential','model','thinking','already','load','session','resume','database','state','traceback','type','value','cannot','error','expected','unsupported','key','index','assertion','encoding','decode','none','path','resolve','pydantic','validation','name','column','table','timed out','connection','cancel'].filter(x=>message.includes(x))});}}catch{}
  }
  life.peer.accept(b);
});
p.onClose(()=>life.peer.disconnect());
try {await life.initialize();await life.open({cwd:config.workspace,nativeSessionId:session.id,mcpServers:[]});report.status='PASS_LOAD_WITHOUT_MCP';}
catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'REJECTED';}
finally {report.stop=await p.stop();writeFileSync(resolve(root,'load-diagnostic.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
