import React,{useState} from 'react';
import {useStore} from './store.tsx';
import {errorMessage} from './action-state.ts';
export function PendingPanel(){
 const s=useStore(),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState<string|null>(null);
 if(!s.pendingOperations?.length)return null;
 return <section className="hint tone-warning" aria-label="待核对提交"><h2>待核对提交（{s.pendingOperations.length}）</h2>
 <p>这些操作可能已在 Core 保存。不会自动重发；修改正文是新意图，旧操作仍需核对。删除本机副本不会取消远端任务。</p>
 {s.pendingOperations.map(r=><details key={r.recordId}><summary>查看待核对操作 · {new Date(r.createdAt).toLocaleString()}</summary>
 <p>请先到项目动态或任务列表核对，再决定是否按原操作重试。</p><pre>{JSON.stringify(r.params,null,2)}</pre>
 <button disabled={s.readOnly||busy!==null} onClick={async()=>{setBusy(r.recordId);try{await s.retryPending?.(r.recordId);}catch(e){setError(errorMessage(e));}finally{setBusy(null);}}}>按原操作重试</button>
 <button disabled={busy!==null} onClick={()=>void s.removePending?.(r.recordId)}>删除本机副本（不取消远端任务）</button>
 <details><summary>诊断元数据（不含正文）</summary><pre>{JSON.stringify({recordId:r.recordId,operationId:r.operationId,identity:r.identity,method:r.method,scope:r.scope,state:r.state})}</pre></details>
 </details>)}{error&&<p role="alert" className="tone-danger">{error}</p>}</section>;
}

/** 只管理本应用前缀；未知归属保持隔离，永不重试。索引键不展示给用户。 */
export function LocalDataPanel(){
 const [revision,setRevision]=useState(0),[opened,setOpened]=useState<string|null>(null);
 const keys=typeof localStorage==='undefined'?[]:Object.keys(localStorage).filter(k=>k.startsWith('agentrouter.pending:')||k.startsWith('agentrouter.pending-migration-backup:')||k.startsWith('agentrouter.task-draft:')||k.startsWith('agentrouter.role-draft:'));
 return <details data-revision={revision}><summary>本机草稿与隔离旧记录（{keys.length}）</summary><p>内容仅保存在本机浏览器存储。旧记录归属不能确认时不会发送；请核对后自行清理。删除本机副本不取消任何远端任务。</p>{keys.map((key,i)=><div key={key}><span>{key.startsWith('agentrouter.task-draft:')?'任务草稿':key.startsWith('agentrouter.pending-migration')?'迁移备份':'归属待确认的旧记录'} {i+1}</span><button className="btn" onClick={()=>setOpened(opened===key?null:key)}>单独查看本机内容</button>{opened===key&&<pre>{localStorage.getItem(key)}</pre>}<button className="btn" onClick={()=>{localStorage.removeItem(key);setOpened(null);setRevision(x=>x+1);}}>删除这份本机副本</button></div>)}</details>;
}
