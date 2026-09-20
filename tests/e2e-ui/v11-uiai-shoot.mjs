import {createServer} from 'node:http';
import {existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const outDir=resolve(root,'docs/v1.1-final/ui-final/screenshots');
const bundle=resolve(root,'apps/desktop/workbench.js');
mkdirSync(outDir,{recursive:true});
const require=createRequire(import.meta.url);
const {chromium}=require(resolve(root,'node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.js'));
const esbuild=resolve(root,'node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe');
execFileSync(esbuild,['apps/desktop/workbench.tsx','--bundle','--platform=browser','--format=iife','--outfile=apps/desktop/workbench.js','--jsx=automatic'],{cwd:root,stdio:'inherit'});

const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=createServer((req,res)=>{const url=new URL(req.url,'http://x');const path=url.pathname==='/'?'/workbench.html':url.pathname;const file=resolve(root,'apps/desktop','.'+path);if(!file.startsWith(resolve(root,'apps/desktop'))||!existsSync(file)){res.writeHead(404);res.end('not found');return;}res.writeHead(200,{'content-type':mime[file.slice(file.lastIndexOf('.'))]??'text/plain'});res.end(readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const browser=await chromium.launch({executablePath:`${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`});
const shots=[
 {name:'01-home',route:'#/',scenario:'full',viewport:{width:1440,height:900},scale:1},
 {name:'02-workbench',route:'#/project/proj_atlas',scenario:'full',viewport:{width:1440,height:900},scale:1},
 {name:'03-role-worksession',route:'#/role/role_zhou',scenario:'full',viewport:{width:1440,height:900},scale:1},
 {name:'04-results-evidence',route:'#/project/proj_atlas/inbox',scenario:'full',viewport:{width:1440,height:900},scale:1},
 {name:'05-workbench-150dpi',route:'#/project/proj_atlas',scenario:'full',viewport:{width:960,height:600},scale:1.5},
 {name:'06-mobile-intervention',route:'#/project/proj_atlas',scenario:'observer',viewport:{width:390,height:844},scale:1},
];
const manifest=[];
try{
 for(const shot of shots){const page=await browser.newPage({viewport:shot.viewport,deviceScaleFactor:shot.scale});await page.goto(`http://127.0.0.1:${port}/workbench.html?scenario=${shot.scenario}`,{waitUntil:'networkidle'});await page.evaluate(h=>location.hash=h,shot.route);await page.waitForSelector('.page',{timeout:15000});await page.waitForTimeout(350);const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));if(width.scroll>width.client+1)throw Error(`${shot.name}: horizontal overflow ${width.scroll}>${width.client}`);const file=resolve(outDir,shot.name+'.png');await page.screenshot({path:file,fullPage:true});manifest.push({...shot,file:`screenshots/${shot.name}.png`,horizontalOverflow:false});await page.close();}
 writeFileSync(resolve(outDir,'manifest.json'),JSON.stringify({source:'working-tree',generatedAt:new Date().toISOString(),shots:manifest},null,2)+'\n');
}finally{await browser.close();server.close();rmSync(bundle,{force:true});}
console.log(`PASS: ${manifest.length} representative UI screenshots`);
