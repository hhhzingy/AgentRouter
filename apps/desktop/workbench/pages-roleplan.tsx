import React,{useEffect,useRef,useState} from 'react';
import type {RolePlanInput,RolePlanValidationVM,PermissionGrant} from '../../../packages/client-contract/c1r1p1/generated.ts';
import {EmptyState} from '../../../packages/ui/index.ts';
import {useStore} from './store.tsx';
import {RoleEditor} from './role-editor.tsx';
import {blankPlan,newGroup,parsePlan,mappingRequired,mapPlan} from './role-draft.ts';
import {exactModel} from './identity.ts';
import {failureState,actionTone,type ActionState,errorMessage} from './action-state.ts';
export function RolePlanPage({projectId}:{projectId:string}){
 const s=useStore(), project=s.snapshot.projects.find(p=>p.id===projectId),workspaces=(s.snapshot.workspaces??[]).filter(w=>w.projectId===projectId&&w.status==='READY');
 const [stage,setStage]=useState<'entry'|'draft'|'mapping'|'review'|'applied'>('entry'),[plan,setPlan]=useState<RolePlanInput|null>(null),[validation,setValidation]=useState<RolePlanValidationVM|null>(null),[confirmed,setConfirmed]=useState<string[]>([]),[grants,setGrants]=useState<PermissionGrant[]>([]),[error,setError]=useState<string|null>(null),[action,setAction]=useState<ActionState>('idle'),[paste,setPaste]=useState(''),[mapping,setMapping]=useState<Record<string,string>>({}),[mappingConfirmed,setMappingConfirmed]=useState(false),[existingSpace,setExistingSpace]=useState(''),[guide,setGuide]=useState('');
 const epoch=useRef(0),sending=useRef(false),alive=useRef(true);
 const draftKey='agentrouter.role-draft:'+JSON.stringify([s.pendingIdentity??s.hello.serverInstanceId,projectId]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;++epoch.current;};},[]);
 useEffect(()=>{if(!s.pendingIdentity)return;const raw=localStorage.getItem(draftKey);if(raw){try{const saved=JSON.parse(raw);setPlan(saved.plan);setExistingSpace(saved.existingSpace??'');setStage('draft');}catch{setError('本机草稿无法读取，请保留原记录后重新导入。');}}},[draftKey]);
 function change(next:RolePlanInput,destination=existingSpace){++epoch.current;setPlan(next);setValidation(null);setConfirmed([]);setStage('draft');setAction('idle');setError(null);localStorage.setItem(draftKey,JSON.stringify({plan:next,existingSpace:destination}));}
 async function validatePlan(next:RolePlanInput){
  if(sending.current)return;const token=++epoch.current;sending.current=true;setAction('submitting');setError(null);setValidation(null);
  try{parsePlan(JSON.stringify(next));if(!existingSpace&&next.groups.some(g=>s.snapshot.spaces.some(x=>x.projectId===projectId&&x.name.trim().toLocaleLowerCase()===g.display_name.trim().toLocaleLowerCase())))throw Error('小组名称与项目中现有小组重复，请修改名称或使用添加到现有小组。');const v=await s.call('rolePlan.validate',{plan:next});if(!alive.current||token!==epoch.current)return;setPlan(next);setValidation(v);setConfirmed([]);setGrants(next.roles.map(r=>({role_key:r.role_key,permissions:{workspace_access:'read_only',allowed_paths:[],tool_profiles:[],network_profile:'none'}})));setStage('review');setAction(v.valid?'idle':'failed');}
  catch(e){if(alive.current&&token===epoch.current){setAction(failureState(e));setError(errorMessage(e)+' '+String(e));}}
  finally{sending.current=false;}
 }
 async function importText(text:string){
  setError(null);try{const next=parsePlan(text);setExistingSpace('');setPlan(next);setValidation(null);setMappingConfirmed(false);
   if(mappingRequired(next,projectId,workspaces.map(w=>w.id))){setMapping(Object.fromEntries([...new Set([...next.roles.map(r=>r.workspace_ref),...next.groups.flatMap(g=>g.workspace_ref?[g.workspace_ref]:[])])].map(id=>[id,workspaces.some(w=>w.id===id)?id:''])));setStage('mapping');}
   else await validatePlan(next);
  }catch(e){setAction('failed');setError(String(e));}
 }
 async function startExisting(id:string){
  const token=++epoch.current;setValidation(null);setExistingSpace(id);if(!id)return;
  try{const plans=await s.call('rolePlan.list',{project_id:projectId});if(!alive.current||token!==epoch.current)return;const source=plans.items.find(p=>p.spaceIds.includes(id));if(!source)throw Error('该历史小组缺少可验证的方案关联，请先查看角色说明。');const g=source.sourcePlan.groups[source.spaceIds.indexOf(id)];const next={...blankPlan(projectId),groups:[g]};setPlan(next);setStage('draft');setError(null);}catch(e){setError(String(e));}
 }
 async function apply(){
  if(sending.current||!plan||!validation?.valid||!validation.requiredConfirmations.every(c=>confirmed.includes(c)))return;
  sending.current=true;setAction('submitting');setError(null);
  try{
   if(existingSpace){if(plan.roles.length!==1)throw Error('现有组增员每次保存一名角色。');await s.call('role.createFromSpec',{spec:plan.roles[0],confirmed:true,permissions:grants[0].permissions},{project_id:projectId,space_id:existingSpace});}
   else await s.call('rolePlan.apply',{plan,plan_hash:validation.planHash,confirmed:true,permission_grants:grants});
   if(!alive.current)return;setAction('succeeded');setStage('applied');localStorage.removeItem(draftKey);
  }catch(e){if(alive.current){setAction(failureState(e));setError(errorMessage(e)+' '+String(e));}}finally{sending.current=false;}
 }
 async function copyGuide(){const text=['请按 agentrouter-role-plan/1 帮我拟定协作方案；不要请求秘密或假定模型可用。','项目：'+project?.name,'现有角色：'+s.snapshot.roles.filter(r=>s.snapshot.spaces.some(g=>g.projectId===projectId&&g.id===r.spaceId)).map(r=>r.name+'：'+r.description).join('；'),'请写明职责/非职责、输入/输出、同组结果去向及最小权限；导入时我会确认项目和工作区映射。'].join('\n');setGuide(text);try{await navigator.clipboard.writeText(text);}catch{setError('剪贴板不可用，请在下方手动复制指南。');}}
 if(!project)return <EmptyState title="项目不存在" body=""/>;
 if(s.capabilities.role_plans===false)return <EmptyState title="当前 Core 不支持 Role Plan" body="仍可在支持该能力的 Core 上保存角色配置。"/>;
 const canValidate=s.capabilities.methods.includes('rolePlan.validate'),canApply=!s.readOnly&&s.capabilities.methods.includes(existingSpace?'role.createFromSpec':'rolePlan.apply');
 return <div className="page page-roleplan" data-page="roleplan"><header className="page-head"><div><a href={`#/project/${projectId}`}>{project.name}</a><h1>添加角色（Role Plan）</h1><p>先编辑、再校验和审阅。配置保存与初始化（Bootstrap）分开；未验证模型不会自动启动。</p></div></header>
 {error&&<div className={`hint tone-${actionTone(action)}`} role="alert" data-action-state={action}>{error}</div>}
 {stage==='entry'&&<div className="roleplan-entries" data-stage="entry">
 <section className="card"><h2>手工创建</h2><p>不用 JSON，从小组与角色表单开始。</p><button className="btn btn-primary" onClick={()=>{setExistingSpace('');const next=blankPlan(projectId);next.groups=[newGroup(workspaces[0]?.id??'',1)];change(next,'');}}>新建空白方案</button>
 <label className="field">添加到现有小组<select aria-label="添加到现有小组" value={existingSpace} onChange={e=>void startExisting(e.target.value)}><option value="">选择小组…</option>{s.snapshot.spaces.filter(g=>g.projectId===projectId&&g.status==='ACTIVE').map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label></section>
 <section className="card"><h2>导入方案（JSON）</h2><p>仅支持 JSON，最多 128 KiB；外部项目与工作区 ID 必须映射确认。</p><input aria-label="导入 Role Plan JSON" type="file" accept=".json,application/json" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>131072){setError('方案超过 128 KiB。');return;}await importText(await f.text());}}/><textarea aria-label="粘贴协作方案 JSON" value={paste} onChange={e=>setPaste(e.target.value)} maxLength={131072}/><button disabled={!paste.trim()} onClick={()=>void importText(paste)}>校验粘贴方案</button></section>
 <section className="card"><h2>AI 规划指南</h2><p>当前没有内部设置会话处理器；即使 Harness 可建会话也不自动启用。</p><button disabled>开始 AI 生成…</button><button onClick={()=>void copyGuide()}>复制给其他 AI 的规划指南</button>{guide&&<textarea aria-label="规划指南" readOnly value={guide}/>}</section></div>}
 {stage==='mapping'&&plan&&<section className="card" data-stage="mapping"><h2>确认导入映射</h2><p>原项目 {plan.project_id} → 当前项目 {project.name}（{projectId}）</p>{Object.keys(mapping).map(id=><label className="field" key={id}>原工作区 {id}<select aria-label={`映射工作区 ${id}`} value={mapping[id]} onChange={e=>{setMapping({...mapping,[id]:e.target.value});setMappingConfirmed(false);}}><option value="">请选择当前项目目录…</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.label} · {w.displayPath}</option>)}</select></label>)}<label><input type="checkbox" checked={mappingConfirmed} onChange={e=>setMappingConfirmed(e.target.checked)}/>我确认项目与工作区映射</label><button disabled={!mappingConfirmed||Object.values(mapping).some(v=>!v)||!canValidate} onClick={()=>void validatePlan(mapPlan(plan,projectId,mapping))}>确认映射并校验</button></section>}
 {stage==='draft'&&plan&&<div data-stage="draft"><RoleEditor plan={plan} onChange={change} workspaces={workspaces} catalog={s.snapshot.modelCatalog??[]} accounts={s.accounts} single={!!existingSpace}/><button className="btn btn-primary" disabled={!canValidate||action==='submitting'||!plan.roles.length||!plan.groups.length} onClick={()=>void validatePlan(plan)}>校验并审阅</button><p>编辑后旧校验与 Hash 立即失效。本机草稿不会自动提交。</p></div>}
 {stage==='review'&&plan&&validation&&<section data-stage="review"><h2>保存前检查</h2>{existingSpace&&<p>新增成员会更新组内角色说明与同组名单；初始化独立进行，用户原暂停状态不变。</p>}<p>{plan.groups.length} 组 / {plan.roles.length} 角色；{validation.valid?'服务器校验通过':'请返回修改方案'}</p>
 {validation.errors.map((e,i)=><p className="hint tone-danger" key={i}>{e.field}：{e.code}</p>)}
 {validation.warnings.map((e,i)=><p className="hint tone-warning" key={i}>待设置：{e.field}（{e.code}）</p>)}
 {plan.roles.map((r,i)=>{const model=exactModel(s.snapshot.modelCatalog??[],r.runtime);return <article className="card" key={r.role_key}><h3>{r.display_name}</h3><p>职责：{r.mission}</p><p>非职责：{r.out_of_scope.join('；')}</p><p>输出：{r.required_outputs.join('；')}</p><p>模型：{model?.display_name??r.runtime.model_id} · {r.runtime.provider_profile_id??'未绑定 Profile'} · {r.runtime.reasoning_effort} · {model?.availability==='AVAILABLE'&&model.source!=='SEED'?'目录已验证':'未验证配置，不能启动'}</p><p>工作区：{workspaces.find(w=>w.id===r.workspace_ref)?.displayPath??'未确认'}</p><p>请求权限：{r.requested_permissions.workspace_access}；拟授予：只读，工具无，网络无（Core 当前上限）</p><p>成果：{r.default_completion_target.type==='user'?'交给我':plan.roles.find(x=>x.role_key===(r.default_completion_target.type==='role_key'?r.default_completion_target.role_key:''))?.display_name}</p>
 <fieldset><legend>审阅拟授予路径（仅所请求的相对路径）</legend>{r.requested_permissions.allowed_paths.length===0?<p>无额外路径</p>:r.requested_permissions.allowed_paths.map(path=><label key={path}><input type="checkbox" checked={grants[i]?.permissions.allowed_paths.includes(path)??false} onChange={e=>setGrants(grants.map((g,n)=>n===i?{...g,permissions:{...g.permissions,allowed_paths:e.target.checked?[...g.permissions.allowed_paths,path]:g.permissions.allowed_paths.filter(v=>v!==path)}}:g))}/>{path}</label>)}</fieldset></article>})}
 {validation.requiredConfirmations.map(c=><label className="confirm-row" key={c}><input type="checkbox" checked={confirmed.includes(c)} onChange={e=>setConfirmed(e.target.checked?[...confirmed,c]:confirmed.filter(v=>v!==c))}/>{{USER_REVIEW:'已审阅职责与结果去向',PERMISSIONS:'已核对请求与拟授予权限',UNVERIFIED_MODELS_CANNOT_START:'理解未验证模型不能启动'}[c]??c}</label>)}
 <details><summary>技术详情</summary><p>Plan Hash：{validation.planHash}</p><pre>{JSON.stringify(plan,null,2)}</pre></details>
 <button disabled={action==='submitting'} onClick={()=>change(plan)}>返回编辑</button><button className="btn btn-primary" disabled={!validation.valid||!canApply||action==='submitting'||!validation.requiredConfirmations.every(c=>confirmed.includes(c))} onClick={()=>void apply()}>确认并应用</button>{!canApply&&<p>观察者只读或当前 Core 未开放此保存方法；草稿仍可编辑。</p>}</section>}
 {stage==='applied'&&<section className="card" data-stage="applied"><h2>配置已保存</h2><p>初始化独立进行；模型未验证、等待初始化与用户暂停分别显示。没有启动真实 Harness。</p><button onClick={()=>{location.hash=`#/project/${projectId}`;}}>返回项目</button></section>}
 </div>;
}
