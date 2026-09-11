import { _electron as electron, expect } from '@playwright/test';
import { readFileSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { build } from 'esbuild';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=realpathSync(process.argv[2]);
const rel=relative(realpathSync('.local/j3-production-pi'),root);
if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('GUI_TEST_SCOPE');
const prior=JSON.parse(readFileSync(resolve(root,'report.json'),'utf8'));
if(prior.status!=='PASS_TASK_AND_BOOTSTRAP'||prior.scope!=='PRODUCTION_CORE_REAL_PI')throw Error('VERIFIED_PI_DATA_REQUIRED');
copyFileSync(resolve(root,'runtime.json'),resolve(root,'core/native-runtime.json'));
const db=new Database(resolve(root,'core/router.db'),{readonly:true});
const role=db.prepare('select id,name from roles').get();db.close();
const resultMarker='GUI2-'+randomUUID();
const report={scope:'REAL_ELECTRON_PRODUCTION_PI_AFTER_CORE_RESTART',status:'FAIL',checks:[],fullIsolationCertified:false,
 code_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 dirty_source:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),resultMarker,
 artifacts:Object.fromEntries(['.local/desktop-w11/p1-main.mjs','.local/desktop-w11/workbench.js','.local/w11-core/core.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))};
let app,page;
await build({entryPoints:['packages/client-transport/p1/local.ts'],outfile:resolve(root,'gui-transport.mjs'),bundle:true,platform:'node',format:'esm',packages:'external'});
try {
 report.stage='LAUNCH';
 app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('.local/desktop-w11/p1-main.mjs')],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:process.env.PATH,TEMP:root,TMP:root,AGENTROUTER_DATA:root,AGENTROUTER_MODE:'LOCAL_CORE'},timeout:30000});
 report.stage='FIRST_WINDOW';
 page=await app.firstWindow();await page.waitForLoadState();
 report.stage='HOME';
 await expect(page.getByRole('heading',{name:'项目',exact:true})).toBeVisible({timeout:20000});
 report.stage='CONTROL';
 await page.getByRole('button',{name:'申请控制',exact:true}).click();
 report.stage='PROJECT';
 await page.getByText('真实pi生产入口验证',{exact:true}).first().click();
 report.stage='ROLE';
 await page.locator(`a[href="#/role/${role.id}"]`).first().click();
 await expect(page.getByRole('heading',{name:role.name,exact:true})).toBeVisible();
 const content=page.getByLabel(`任务内容（去向：${role.name}）`,{exact:true});
 report.stage='COMPOSE';
 await content.fill('Calculate 1+1. Use route_context then route_finish with outcome succeeded, summary '+resultMarker+', body 2, outputs []. After tool success stop.');
 await page.getByRole('button',{name:/^提交任务$|^派发到队列$/}).click();
 await expect(page.locator('[data-action-state="succeeded"]').first()).toBeVisible();
 let result;
 for(let i=0;i<90;i++){
  const read=new Database(resolve(root,'core/router.db'),{readonly:true});
  result=read.prepare('select r.id,r.task_id,r.publication_state,n.state from results r join runs n on n.task_id=r.task_id where r.summary=?').get(resultMarker);read.close();
  if(result?.publication_state==='PUBLISHED'&&result.state==='SUCCEEDED')break;
  await new Promise(r=>setTimeout(r,1000));
 }
 if(result?.publication_state!=='PUBLISHED'||result.state!=='SUCCEEDED')throw Error('GUI_RESULT_NOT_VERIFIED');
 report.result=result;
 if(!page.url().endsWith('/role/'+role.id)) {
  await page.getByRole('link',{name:'工作台',exact:true}).click();
  await page.locator(`a[href="#/role/${role.id}"]`).first().click();
 }
 for(let i=0;i<10 && !(await page.getByText(resultMarker,{exact:true}).count());i++){
  const more=page.getByRole('button',{name:/有新消息，继续读取|加载更多/});
  if(!(await more.count()))break;
  await more.first().click();
 }
 await expect(page.getByText(resultMarker,{exact:true}).first()).toBeVisible();
 report.checks.push('Electron由默认数据配置启动生产Core并读取持久角色','GUI真实派发到pi，Route结果发布与原生Job屏障');
 await page.screenshot({path:resolve(root,'gui-role.png'),fullPage:true});
 await page.reload();
 await expect(page.getByRole('heading',{name:role.name,exact:true})).toBeVisible();
 await page.screenshot({path:resolve(root,'gui-role-reloaded.png'),fullPage:true});
 report.checks.push('Core重启恢复native session，GUI重载持久角色和结果');report.status='PASS';
} catch(e){if(page)await page.screenshot({path:resolve(root,'gui-failure.png'),fullPage:true}).catch(()=>{});report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'GUI_CHECK_FAILED';}
finally {
 writeFileSync(resolve(root,'gui-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({stage:'CLEANUP_APP',status:report.status}));
 if(app) {
  let timer;
  await Promise.race([app.close().catch(()=>app.process().kill()),new Promise(r=>{timer=setTimeout(()=>{app.process().kill();r();},5000);})]);
  clearTimeout(timer);
 }
 console.log(JSON.stringify({stage:'CLEANUP_CORE'}));
 let cleanup;
 try {
  const {LocalCoreTransport}=await import(pathToFileURL(resolve(root,'gui-transport.mjs')));
  const t=cleanup=new LocalCoreTransport(resolve(root,'core'));const s=await t.connect({clientId:'gui_cleanup',clientVersion:'1.0.0',requestedMode:'controller',contractRevision:'C1R1P1',mode:'LOCAL_CORE'});
  const snap=await s.request('system.snapshot',{});
  const lease=await s.request('control.acquire',{}, {operationId:'gui-cleanup-acquire',expectedRevision:snap.revision,scope:{}});
  await s.request('runtime.shutdownCore',{}, {operationId:'gui-cleanup-stop',expectedRevision:snap.revision,scope:{},leaseId:lease.leaseId});await t.close();
 }catch{report.cleanup='SHUTDOWN_UNCONFIRMED';}finally{await cleanup?.close();}
 writeFileSync(resolve(root,'gui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({root,...report}));
}
if(report.status!=='PASS')process.exitCode=1;
