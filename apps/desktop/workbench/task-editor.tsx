import React,{useRef,useState} from 'react';
import type {RoleVM,TaskVM} from '../../../packages/client-contract/c1r1p1/generated.ts';
import {useStore} from './store.tsx';
import {compileTask,emptyTaskDraft,maySupplement,type TaskDraft} from './task-draft.ts';
import {actionTone,failureState,errorMessage,type ActionState} from './action-state.ts';
import {Button,Drawer} from '../../../packages/ui/index.ts';
export function TaskEditor({role}:{role:RoleVM}){
 const s=useStore(),[mode,setMode]=useState<'NEW_TASK'|'TASK_INPUT'>('NEW_TASK'),[taskId,setTaskId]=useState('');
 const tasks=s.snapshot.tasks.filter(t=>t.assigneeRoleId===role.id),task=tasks.find(t=>t.id===taskId);
 const choose=(next:'NEW_TASK'|'TASK_INPUT')=>{setMode(next);if(next==='TASK_INPUT'&&!taskId)setTaskId(tasks.find(maySupplement)?.id??'');};
 const key='agentrouter.task-draft:'+JSON.stringify([s.pendingIdentity??s.hello.serverInstanceId,role.spaceId,role.id,mode,mode==='TASK_INPUT'?taskId:'']);
 return <section className="composer" aria-label={`给 ${role.name} 安排工作`}>
 <div className="composer-modes" role="group" aria-label="输入模式"><button className="btn" aria-pressed={mode==='NEW_TASK'} onClick={()=>choose('NEW_TASK')}>新任务</button><button className="btn" aria-pressed={mode==='TASK_INPUT'} onClick={()=>choose('TASK_INPUT')}>补充到任务</button></div>
 {mode==='TASK_INPUT'&&<label className="field">补充目标任务<select aria-label="补充目标任务" value={taskId} onChange={e=>setTaskId(e.target.value)}><option value="">请选择明确的任务…</option>{tasks.filter(t=>['WAITING_INPUT','ACTIVE'].includes(t.state)||t.id===taskId).map(t=><option key={t.id} value={t.id} disabled={!maySupplement(t)}>{t.summary} · {t.id}{maySupplement(t)?'（等待用户补充）':'（当前不能补充）'}</option>)}</select></label>}
 <DraftFields key={key} storageKey={key} role={role} mode={mode} task={task}/>
 </section>;
}

/** WAITING_INPUT 的正式 Sheet：问题、Task 范围与回复草稿始终绑定在一起。 */
export function WaitingInputSheet({role,task,onClose}:{role:RoleVM;task:TaskVM;onClose:()=>void}){
 const s=useStore();
 const key='agentrouter.task-draft:'+JSON.stringify([s.pendingIdentity??s.hello.serverInstanceId,role.spaceId,role.id,'TASK_INPUT',task.id]);
 return <Drawer title="回复等待输入的任务" onClose={onClose} footer={<Button onClick={onClose}>关闭</Button>}>
  <div className="attention-context">
   <span className="eyebrow">{role.name} · {task.id}</span>
   <h3>{task.summary}</h3>
   <p>{task.blockedReason||'该任务正在等待你的补充信息。'}</p>
   <p className="muted">回复只关联当前 Task，不会创建新 Task，也不会写入历史 WorkSession。</p>
  </div>
  <DraftFields storageKey={key} role={role} mode="TASK_INPUT" task={task}/>
 </Drawer>;
}
function DraftFields({storageKey,role,mode,task}:{storageKey:string;role:RoleVM;mode:'NEW_TASK'|'TASK_INPUT';task?:TaskVM}){
 const s=useStore();
 const [draft,setDraft]=useState<TaskDraft>(()=>{if(typeof localStorage==='undefined')return emptyTaskDraft();try{return {...emptyTaskDraft(),...JSON.parse(localStorage.getItem(storageKey)??'{}')};}catch{return emptyTaskDraft();}});
 const [state,setState]=useState<ActionState>('idle'),[note,setNote]=useState(''),[error,setError]=useState<unknown>(null),sending=useRef(false),composing=useRef(false);
 const waiting=mode==='TASK_INPUT',method=waiting?'conversation.sendUserInput':'task.submitFromUser';
 const peers=s.snapshot.roles.filter(r=>r.spaceId===role.spaceId&&r.id!==role.id&&r.status!=='ARCHIVED');
 const canSend=!s.readOnly&&s.capabilities.methods.includes(method)&&(!waiting||maySupplement(task))&&role.status!=='ARCHIVED';
 const willQueue=s.snapshot.runs.some(r=>r.roleId===role.id&&['CREATED','STARTING','RUNNING','WAITING_APPROVAL','SETTLING'].includes(r.state))||s.snapshot.tasks.some(t=>t.assigneeRoleId===role.id&&['ACTIVE','WAITING_INPUT','QUEUED'].includes(t.state))||role.status==='PAUSED';
 function edit(patch:Partial<TaskDraft>){const next={...draft,...patch};setDraft(next);if(typeof localStorage!=='undefined')localStorage.setItem(storageKey,JSON.stringify(next));if(state!=='uncertain'){setState('idle');setNote('');}}
 async function submit(){
  if(sending.current||composing.current||!canSend||!draft.body.trim())return;
  sending.current=true;setState('submitting');setError(null);setNote('正在提交…');
  try{
   if(waiting){await s.call('conversation.sendUserInput',{role_id:role.id,task_id:task!.id,body:draft.body});setNote('补充已提交，仍关联原任务。');}
   else {const request=compileTask(role,draft,s.snapshot.roles);const saved=await s.call('task.submitFromUser',{request});setNote(saved.state==='QUEUED'?`已入队${saved.queuePosition?`，队列位置 ${saved.queuePosition}`:''}。执行取决于初始化、模型与资源条件。`:'已提交，业务结果以后续记录为准。');}
   const next={...draft,body:'',summary:''};setDraft(next);localStorage.setItem(storageKey,JSON.stringify(next));setState('succeeded');
  }catch(e){setState(failureState(e));setError(e);setNote(failureState(e)==='uncertain'?errorMessage(e):e instanceof Error&&!/^[A-Z_]+$/.test(e.message)?e.message:errorMessage(e));}
  finally{sending.current=false;}
 }
 return <div className="task-editor" data-input-mode={mode}>
 <fieldset disabled={state==='submitting'} style={{border:0,padding:0,margin:0,minWidth:0}}><p><b>{waiting?`补充到：${task?.summary??'尚未选择任务'}`:`新任务 → ${role.name}`}</b>{waiting&&task&&<small>（{task.id}；原结果去向：{task.completionTargetLabel}）</small>}</p>
 {!waiting&&role.interventionState&&role.interventionState!=='NONE'&&<p className="hint">角色尚待设置或初始化。可以保存本机草稿；提交到 Core 只表示入队，不会跳过执行条件。<a href={`#/roleplan/${s.snapshot.spaces.find(g=>g.id===role.spaceId)?.projectId}`}>查看角色配置</a></p>}
 {waiting&&!maySupplement(task)&&<p className="hint tone-warning">当前没有可补充的明确任务。运行中任务不会被中断，请选择新任务排队或等待用户补充请求。</p>}
 <label className="field"><span>任务内容（去向：{role.name}）</span><textarea aria-label={waiting?'补充内容':`任务内容（去向：${role.name}）`} value={draft.body} rows={5} maxLength={8192} disabled={state==='submitting'} placeholder={waiting?'填写此任务的补充信息…':'描述要完成的工作…'} onChange={e=>edit({body:e.target.value})} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter'&&!e.nativeEvent.isComposing&&!composing.current){e.preventDefault();void submit();}}}/></label>
 {!waiting&&<><label className="field">结果去向<select aria-label="结果去向" value={draft.target} disabled={state==='submitting'} onChange={e=>edit({target:e.target.value,handoff:e.target.value==='user'?false:draft.handoff})}><option value="user">交给我</option>{peers.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
 {draft.target!=='user'&&<><label><input type="checkbox" checked={draft.handoff} onChange={e=>edit({handoff:e.target.checked})}/>交接任务给目标角色</label><p>{draft.handoff?'成果交给该角色继续工作':'仅转交结果，不默认派发后续新任务'}</p></>}
 {draft.handoff&&<label className="field">下一步要求（必填）<textarea aria-label="下一步要求" value={draft.instruction} disabled={state==='submitting'} onChange={e=>edit({instruction:e.target.value})}/></label>}
 <details><summary>更多任务设置</summary><label className="field">任务摘要（留空使用正文首段）<input value={draft.summary} maxLength={240} onChange={e=>edit({summary:e.target.value})}/></label><label className="field">预期成果（每行一项）<textarea aria-label="预期成果" value={draft.expected} onChange={e=>edit({expected:e.target.value})}/></label><label className="field">异常去向<select value={draft.problem} onChange={e=>edit({problem:e.target.value})}><option value="">遵循项目规则</option><option value="user">我</option>{peers.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="field">已有产物 ID（每行一项）<textarea value={draft.artifactIds} onChange={e=>edit({artifactIds:e.target.value})}/></label><label className="field">外部资料 URL（每行一项）<textarea value={draft.externalUrls} onChange={e=>edit({externalUrls:e.target.value})}/></label><p>只记录引用，不自动访问外链。Git/实时工作区引用按 Core 能力开放。</p></details></>}
 {state==='uncertain'&&<p className="hint tone-warning">提交结果尚未确认，草稿已保留。请在页面顶部的「待核对提交」核对 Core 状态；此表单不会再次发送同一回复。</p>}
 {note&&<div role="status" className={`hint tone-${actionTone(state)}`} data-action-state={state}>{note}{Boolean(error)&&<details><summary>技术详情</summary>{String(error)}</details>}</div>}
 <div className="composer-foot"><button className="btn" disabled={state==='submitting'} onClick={()=>{localStorage.setItem(storageKey,JSON.stringify(draft));setNote('草稿已保存到本机，尚未提交。');if(state!=='uncertain')setState('idle');}}>保存本机草稿</button><button className="btn btn-primary" disabled={!canSend||state==='submitting'||state==='uncertain'||!draft.body.trim()||(!waiting&&(!draft.expected.trim()||(draft.handoff&&!draft.instruction.trim())))} onClick={()=>void submit()}>{waiting?'提交补充':willQueue?'派发到队列':'提交任务'}</button></div>
 </fieldset>{s.readOnly&&<p>只读或断线：可以编辑本机草稿，不能远端提交。</p>}<small>Enter 换行，Ctrl+Enter 提交；中文输入法选词期间不会发送。草稿与待核对提交分开保存。</small>
 </div>;
}
