import React,{useState} from 'react';
import {useStore} from './store.tsx';
import {errorMessage} from './action-state.ts';
export function PendingPanel(){
 const s=useStore(),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState<string|null>(null),[recoveredJoin,setRecoveredJoin]=useState<string|null>(null);
 if(!s.pendingOperations?.length&&!recoveredJoin)return null;
 return <section className="hint tone-warning" aria-label="待核对提交"><h2>待核对提交（{s.pendingOperations?.length??0}）</h2>
 <p>这些操作可能已在 Core 保存。不会自动重发；修改正文是新意图，旧操作仍需核对。删除本机副本不会取消远端任务。</p>
 {s.pendingOperations?.map(r=><details key={r.recordId}><summary>查看待核对操作 · {new Date(r.createdAt).toLocaleString()}</summary>
 <p>{r.method==='result.requestChanges'?'请查询原 Result 的验收与后续任务；不要生成新操作 ID 重发。':'请先到项目动态或任务列表核对，再决定是否按原操作重试。'}</p><pre>{JSON.stringify(r.params,null,2)}</pre>
 {r.method==='result.requestChanges'?<button disabled={busy!==null} onClick={async()=>{setBusy(r.recordId);try{const id=(r.params as {id?:unknown})?.id;if(typeof id!=='string')throw Error('PENDING_STORAGE_INVALID');const status=await s.callExtension('result.reviewStatus',{id}) as {acceptance:string;follow_up_task?:{id:string}|null};if(status.acceptance==='REJECTED'&&status.follow_up_task){await s.removePending?.(r.recordId);setError(`已确认修改请求：后续任务 ${status.follow_up_task.id}`);}else setError(`Core 当前验收状态：${status.acceptance}；未确认后续任务，请继续核对。`);}catch(e){setError(errorMessage(e));}finally{setBusy(null);}}}>检查修改请求状态</button>:<button disabled={s.readOnly||busy!==null} onClick={async()=>{setBusy(r.recordId);try{const result=await s.retryPending?.(r.recordId) as {slot_id?:unknown;claim_code?:unknown}|undefined;if(r.method==='participant.slot.create'&&typeof result?.slot_id==='string'){const p=r.params as {role_id?:unknown;participant_kind?:unknown};setRecoveredJoin(['AgentRouter Participant Join',`role_id: ${String(p.role_id??'')}`,`slot_id: ${result.slot_id}`,`participant_kind: ${String(p.participant_kind??'')}`,...(typeof result.claim_code==='string'?[`claim_code: ${result.claim_code}`]:[])].join('\n'));}}catch(e){setError(errorMessage(e));}finally{setBusy(null);}}}>按原操作重试</button>}
 <button disabled={busy!==null} onClick={()=>void s.removePending?.(r.recordId)}>删除本机副本（不取消远端任务）</button>
 <details><summary>诊断元数据（不含正文）</summary><pre>{JSON.stringify({recordId:r.recordId,operationId:r.operationId,identity:r.identity,method:r.method,scope:r.scope,state:r.state})}</pre></details>
 </details>)}{recoveredJoin&&<div className="join-instruction"><b>已核对的 Join Instruction</b><p>本次回执已恢复；请交给预期 Participant。关闭后此界面不再展示配对码；若已复制，请保护剪贴板内容。</p><pre>{recoveredJoin}</pre><button onClick={async()=>{try{await navigator.clipboard.writeText(recoveredJoin);}catch{setError('无法访问剪贴板，请手动复制 Join Instruction。');}}}>复制 Join Instruction</button><button onClick={()=>setRecoveredJoin(null)}>关闭</button></div>}{error&&<p role="alert" className="tone-danger">{error}</p>}</section>;
}

/** 只管理本应用前缀；未知归属保持隔离，永不重试。索引键不展示给用户。 */
export function LocalDataPanel(){
 const [revision,setRevision]=useState(0),[opened,setOpened]=useState<string|null>(null);
 const keys=typeof localStorage==='undefined'?[]:Object.keys(localStorage).filter(k=>k.startsWith('agentrouter.pending:')||k.startsWith('agentrouter.pending-migration-backup:')||k.startsWith('agentrouter.task-draft:')||k.startsWith('agentrouter.role-draft:'));
 return <details data-revision={revision}><summary>本机草稿与隔离旧记录（{keys.length}）</summary><p>内容仅保存在本机浏览器存储。旧记录归属不能确认时不会发送；请核对后自行清理。删除本机副本不取消任何远端任务。</p>{keys.map((key,i)=><div key={key}><span>{key.startsWith('agentrouter.task-draft:')?'任务草稿':key.startsWith('agentrouter.pending-migration')?'迁移备份':'归属待确认的旧记录'} {i+1}</span><button className="btn" onClick={()=>setOpened(opened===key?null:key)}>单独查看本机内容</button>{opened===key&&<pre>{localStorage.getItem(key)}</pre>}<button className="btn" onClick={()=>{localStorage.removeItem(key);setOpened(null);setRevision(x=>x+1);}}>删除这份本机副本</button></div>)}</details>;
}
