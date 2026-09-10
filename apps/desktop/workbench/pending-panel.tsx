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
