import {it,expect} from 'vitest';
import {PendingStore} from '../../apps/desktop/workbench/pending.ts';
import {failureState,actionTone} from '../../apps/desktop/workbench/action-state.ts';
import {exactModel,exactWorkspace} from '../../apps/desktop/workbench/identity.ts';
import {modelCatalog} from '../../packages/ui-mocks/data.ts';
class MemoryStorage implements Storage {
 data=new Map<string,string>(); get length(){return this.data.size;} clear(){this.data.clear();}getItem(k:string){return this.data.get(k)??null;}key(i:number){return [...this.data.keys()][i]??null;}removeItem(k:string){this.data.delete(k);}setItem(k:string,v:string){this.data.set(k,v);}
}
const identity={mode:'LOCAL_CORE' as const,dataId:'dataset_one',clientId:'workbench'};
it('J2 双 Core 和模拟模式不共享同正文待核对记录；删除不触发远端取消',()=>{
 const storage=new MemoryStorage(), a=new PendingStore(storage,identity),b=new PendingStore(storage,{...identity,dataId:'dataset_two'}),mock=new PendingStore(storage,{...identity,mode:'PREVIEW_MOCK'});
 const command=a.prepare('role.rename',{id:'same',name:'正文'},1,{});a.markUncertain(command.recordId);
 expect(b.list()).toEqual([]);expect(mock.list()).toEqual([]);
 expect(new PendingStore(storage,identity).prepare('role.rename',{id:'same',name:'正文'},9,{}).operationId).toBe(command.operationId);
 a.prepare('role.rename',{id:'same',name:'修改正文'},9,{});expect(a.list()).toHaveLength(2);
 expect([...storage.data.keys()].join()).not.toContain('正文');expect(JSON.stringify(a.metadata())).not.toContain('正文');
 a.remove(command.recordId);expect(a.list()).toHaveLength(1);
});
it('J2 迁移保留原 ID 和原修订；未知 Core 旧数据保留且不重发',()=>{
 const storage=new MemoryStorage(), key='agentrouter.pending:'+identity.dataId,command={operationId:'op_old',expectedRevision:7,scope:{project_id:'p'}};
 storage.setItem(key,JSON.stringify({[JSON.stringify({method:'role.rename',params:{id:'r',name:'正文'}})]:command}));storage.setItem('agentrouter.pending:unknown','untouched');
 const s=new PendingStore(storage,identity);s.migrateLegacy();expect(s.list()[0]).toMatchObject(command);expect(storage.getItem(key)).toBeNull();expect(storage.getItem('agentrouter.pending:unknown')).toBe('untouched');expect([...storage.data.keys()].some(k=>k.startsWith('agentrouter.pending-migration-backup:'))).toBe(true);
});
it('J2 错误与未知不会使用成功色',()=>{expect(actionTone(failureState(new Error('INVALID_PARAMS')))).toBe('danger');expect(actionTone(failureState(new Error('REQUEST_TIMEOUT')))).toBe('warning');});
it('J2 同名模型跨 Provider/Profile 不误选，缺少唯一身份返回未知',()=>{
 const a=modelCatalog[0],b={...a,id:'other',provider_profile_id:'other_profile'},selection={harness:a.harness,model_id:a.model_id,reasoning_effort:'high',selection_source:'seed' as const};
 expect(exactModel([a,b],selection)).toBeUndefined();expect(exactModel([a,b],{...selection,provider_profile_id:b.provider_profile_id})).toBe(b);
});

it('J2 core/core-ui 前缀与跨项目同名目录只按权威 ID 匹配',()=>{
 const workspace={id:'ws-core',projectId:'p-one',label:'core',displayPath:'E:/one/core',kind:'DIRECTORY' as const,status:'READY' as const,access:'READ_ONLY' as const,revision:1};
 const ui={...workspace,id:'ws-core-ui',label:'core-ui',displayPath:'E:/one/core-ui'},foreign={...workspace,projectId:'p-two',displayPath:'E:/two/core'};
 const charter={projectId:'p-one',workspaceId:'ws-core-ui'} as Parameters<typeof exactWorkspace>[1];
 expect(exactWorkspace([foreign,workspace,ui],charter,'p-one')).toBe(ui);
 expect(exactWorkspace([foreign,workspace],charter,'p-one')).toBeUndefined();
 expect(exactWorkspace([foreign,workspace,ui],charter,'p-two')).toBeUndefined();
 expect(exactWorkspace([foreign,workspace,ui],null,'p-one')).toBeUndefined();
});
