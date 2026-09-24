import React from 'react';
import type {RolePlanInput,PlanRole,WorkspaceVM,ModelDescriptorVM,AccountProfileVM} from '../../../packages/client-contract/c1r1p1/generated.ts';
import {newGroup,newRole,lines,modelSelection} from './role-draft.ts';
import {exactModel} from './identity.ts';
export function RoleEditor({plan,onChange,workspaces,catalog,accounts,single=false}:{plan:RolePlanInput;onChange:(p:RolePlanInput)=>void;workspaces:WorkspaceVM[];catalog:ModelDescriptorVM[];accounts:AccountProfileVM[];single?:boolean}){
 const update=(index:number,patch:Partial<PlanRole>)=>onChange({...plan,roles:plan.roles.map((r,i)=>i===index?{...r,...patch}:r)});
 const groups=plan.groups;
 return <section className="role-editor" aria-label="角色方案编辑器">
 <label className="field">方案名称<input value={plan.title} onChange={e=>onChange({...plan,title:e.target.value})}/></label>
 <label className="field">方案目标（每行一项）<textarea value={plan.goals.join('\n')} onChange={e=>onChange({...plan,goals:lines(e.target.value)})}/></label>
 <details><summary>方案非目标与假设</summary><label className="field">非目标<textarea value={plan.non_goals.join('\n')} onChange={e=>onChange({...plan,non_goals:lines(e.target.value)})}/></label><label className="field">假设<textarea value={plan.assumptions.join('\n')} onChange={e=>onChange({...plan,assumptions:lines(e.target.value)})}/></label></details>
 {!single&&<button className="btn" onClick={()=>onChange({...plan,groups:[...groups,newGroup(workspaces[0]?.id??'',groups.length+1)]})}>添加小组</button>}
 {groups.map((g,i)=><fieldset key={g.group_key}><legend>小组 {i+1}</legend>
 <label className="field">小组名称<input aria-label={`小组 ${i+1} 名称`} value={g.display_name} disabled={single} onChange={e=>onChange({...plan,groups:groups.map((x,n)=>n===i?{...x,display_name:e.target.value}:x)})}/></label>
 <label className="field">小组目标<input value={g.purpose} disabled={single} onChange={e=>onChange({...plan,groups:groups.map((x,n)=>n===i?{...x,purpose:e.target.value}:x)})}/></label>
 <button className="btn" disabled={single&&plan.roles.length>0} onClick={()=>onChange({...plan,roles:[...plan.roles,newRole(g,catalog[0],plan.roles.length+1)]})}>为小组 {i+1} 添加角色</button>
 {!single&&<button onClick={()=>onChange({...plan,groups:groups.filter((_,n)=>n!==i),roles:plan.roles.filter(r=>r.group_key!==g.group_key)})}>删除小组及其草稿角色</button>}
 </fieldset>)}
 {plan.roles.map((r,i)=>{const model=exactModel(catalog,r.runtime),choices=catalog.filter(m=>m.harness===r.runtime.harness);return <fieldset key={r.role_key} className="role-draft"><legend>角色 {i+1}</legend>
 <label className="field">角色名称<input aria-label={`角色 ${i+1} 名称`} value={r.display_name} onChange={e=>update(i,{display_name:e.target.value})}/></label>
 <label className="field">所属小组<select value={r.group_key} disabled={single} onChange={e=>update(i,{group_key:e.target.value})}>{groups.map(g=><option key={g.group_key} value={g.group_key}>{g.display_name}</option>)}</select></label>
 <label className="field">说明模板<select defaultValue="analysis" onChange={e=>update(i,e.target.value==='analysis'?{mission:'阅读资料并提供有依据的分析',responsibilities:['核对证据，区分事实与未知'],required_outputs:['分析结论与来源']}:{mission:'完成明确范围的实现与测试',responsibilities:['实现授权变更','执行相关测试并报告结果'],required_outputs:['变更说明与测试证据']})}><option value="analysis">读资料 / 分析（可编辑）</option><option value="implementation">实现 / 测试（可编辑）</option></select></label>
 <label className="field">职责<textarea aria-label={`角色 ${i+1} 职责`} value={r.mission} onChange={e=>update(i,{mission:e.target.value})}/></label>
 <details><summary>职责细节、非职责与成果要求</summary><label className="field">工作事项（每行一项）<textarea value={r.responsibilities.join('\n')} onChange={e=>update(i,{responsibilities:lines(e.target.value)})}/></label>
 <label className="field">非职责<textarea value={r.out_of_scope.join('\n')} onChange={e=>update(i,{out_of_scope:lines(e.target.value)})}/></label>
 <label className="field">输出要求<textarea value={r.required_outputs.join('\n')} onChange={e=>update(i,{required_outputs:lines(e.target.value)})}/></label>
 </details><details><summary>运行配置：{r.runtime.harness} · {r.runtime.model_id}（可保存待验证配置）</summary><label className="field">执行工具（Harness）<select value={r.runtime.harness} onChange={e=>{const harness=e.target.value as PlanRole['runtime']['harness'];const m=catalog.find(m=>m.harness===harness);update(i,{runtime:m?modelSelection(m):{...r.runtime,harness,provider_profile_id:undefined,model_id:'unconfigured'}});}}>{['codex','kimi_code','pi'].map(h=><option key={h}>{h}</option>)}</select></label>
 <label className="field">模型 / Provider Profile<select aria-label={`角色 ${i+1} 模型`} value={model?.id??''} onChange={e=>{const m=catalog.find(m=>m.id===e.target.value);if(m)update(i,{runtime:modelSelection(m)});}}><option value="">目录中未确认</option>{choices.map(m=><option key={m.id} value={m.id}>{m.display_name} · {m.provider_profile_id} · {m.availability==='AVAILABLE'?'目录已验证':'未验证配置'}</option>)}</select></label>
 <label className="field">原生推理档位<select value={r.runtime.reasoning_effort} onChange={e=>update(i,{runtime:{...r.runtime,reasoning_effort:e.target.value}})}>{(model?.reasoning.levels.length?model.reasoning.levels:[r.runtime.reasoning_effort]).map(level=><option key={level}>{level}</option>)}</select></label>
 <label className="field">账号 Profile<select value={r.runtime.account_profile_id??''} onChange={e=>update(i,{runtime:{...r.runtime,account_profile_id:e.target.value||undefined}})}><option value="">尚未绑定账号（可保存配置）</option>{accounts.filter(a=>a.harness===r.runtime.harness).map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
 <label className="field">工作区<select value={r.workspace_ref} onChange={e=>update(i,{workspace_ref:e.target.value})}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.label} · {w.displayPath}</option>)}</select></label>
 <p>模型/账号未验证时仅保存配置，不能启动真实执行。</p>
 </details><details><summary>更多：权限、输入、结果与异常去向</summary>
 <label className="field">可接受输入<textarea value={r.accepted_inputs.join('\n')} onChange={e=>update(i,{accepted_inputs:lines(e.target.value)})}/></label>
 {(['default_completion_target','problem_target'] as const).map(key=><label className="field" key={key}>{key==='problem_target'?'异常交给':'默认成果交给'}<select value={r[key].type==='user'?'user':r[key].role_key} onChange={e=>update(i,{[key]:e.target.value==='user'?{type:'user'}:{type:'role_key',role_key:e.target.value}})}><option value="user">我</option>{plan.roles.filter(x=>x.group_key===r.group_key&&x.role_key!==r.role_key).map(x=><option value={x.role_key} key={x.role_key}>{x.display_name}</option>)}</select></label>)}
 <label className="field">请求工作区权限<select value={r.requested_permissions.workspace_access} onChange={e=>update(i,{requested_permissions:{...r.requested_permissions,workspace_access:e.target.value as 'read_only'|'read_write'}})}><option value="read_only">只读</option><option value="read_write">读写（当前 Core 仍保守限制为只读）</option></select></label>
 <label className="field">请求相对路径（每行一项）<textarea value={r.requested_permissions.allowed_paths.join('\n')} onChange={e=>update(i,{requested_permissions:{...r.requested_permissions,allowed_paths:lines(e.target.value)}})}/></label>
 <label className="field">请求工具配置<textarea value={r.requested_permissions.tool_profiles.join('\n')} onChange={e=>update(i,{requested_permissions:{...r.requested_permissions,tool_profiles:lines(e.target.value)}})}/></label>
 <label className="field">网络请求<select value={r.requested_permissions.network_profile} onChange={e=>update(i,{requested_permissions:{...r.requested_permissions,network_profile:e.target.value as PlanRole['requested_permissions']['network_profile']}})}>{['none','provider_only','project_allowlist','custom_request'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label className="field">初始化补充说明<textarea value={r.bootstrap_notes} onChange={e=>update(i,{bootstrap_notes:e.target.value})}/></label>
 </details>
 <button onClick={()=>onChange({...plan,roles:plan.roles.filter((_,n)=>n!==i)})}>删除角色草稿</button>
 </fieldset>})}
 </section>;
}
