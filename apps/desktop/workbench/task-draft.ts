import type {RoleVM,TaskVM,UserRouteRequest,UserRouteReference} from '../../../packages/client-contract/c1r1p1/generated.ts';
export type TaskDraft={body:string;summary:string;expected:string;target:string;handoff:boolean;instruction:string;problem:string;artifactIds:string;externalUrls:string};
export const emptyTaskDraft=():TaskDraft=>({body:'',summary:'',expected:'提交可核验的成果',target:'user',handoff:false,instruction:'',problem:'',artifactIds:'',externalUrls:''});
export function maySupplement(task:TaskVM|undefined){return task?.state==='WAITING_INPUT'&&task.blockedReason==='WAITING_FOR_USER_INPUT';}
export function compileTask(role:RoleVM,d:TaskDraft,roles:RoleVM[]):UserRouteRequest{
 if(!d.body.trim()||!d.expected.trim())throw Error('请填写任务正文和预期成果。');
 const allowed=(id:string)=>id==='user'||roles.some(r=>r.id===id&&r.spaceId===role.spaceId&&r.id!==role.id&&r.status!=='ARCHIVED');
 if(!allowed(d.target)||(d.problem&&!allowed(d.problem)))throw Error('结果或异常目标不在同一小组。');
 if(d.handoff&&(d.target==='user'||!d.instruction.trim()))throw Error('继续工作需要同组角色和明确的下一步要求。');
 const inputs:UserRouteReference[]=d.artifactIds.split('\n').map(x=>x.trim()).filter(Boolean).map(artifact_id=>({kind:'artifact',artifact_id}));
 for(const uri of d.externalUrls.split('\n').map(x=>x.trim()).filter(Boolean)){const u=new URL(uri);if(!['http:','https:'].includes(u.protocol))throw Error('外部资料只接受 http/https URL。');inputs.push({kind:'external',uri,description:'用户明确提供的参考资料'});}
 return {kind:'task.request',to:{type:'role',id:role.id},summary:d.summary.trim()||d.body.slice(0,240),body:d.body,inputs,expected:d.expected.split('\n').map(x=>x.trim()).filter(Boolean),completion:d.handoff?{mode:'handoff',to:{type:'role',id:d.target},instruction:d.instruction}:{mode:'result',to:d.target==='user'?{type:'user'}:{type:'role',id:d.target}},...(d.problem?{on_problem:d.problem==='user'?{type:'user'}:{type:'role',id:d.problem}}:{})};
}
