import type {Method,Scope} from '../../../packages/client-contract/c1r1p1/generated.ts';
import type {CoreIdentity} from './identity.ts';
export type PendingMethod = Method | 'roleSession.create' | 'roleSession.switch' | 'result.requestChanges' | 'participant.slot.create';
export type PendingRecord={recordId:string;identity:CoreIdentity;method:PendingMethod;params:unknown;operationId:string;expectedRevision:number;scope:Scope;createdAt:number;state:'submitting'|'uncertain';requestKey?:string;preflightHash?:string};
export class PendingStore {
 readonly key:string;
 constructor(readonly storage:Storage,readonly identity:CoreIdentity){this.key='agentrouter.pending.v2:'+JSON.stringify(identity);}
 list():PendingRecord[]{const rows=JSON.parse(this.storage.getItem(this.key)??'[]') as PendingRecord[];if(!Array.isArray(rows))throw Error('PENDING_STORAGE_INVALID');return rows.filter(r=>JSON.stringify(r.identity)===JSON.stringify(this.identity));}
 private write(rows:PendingRecord[]){const data=JSON.stringify(rows);if(data.length>1048576||rows.length>1000)throw Error('PENDING_STORAGE_FULL');this.storage.setItem(this.key,data);}
 prepare(method:PendingMethod,params:unknown,revision:number,scope:Scope,preflightHash?:string){
  const rows=this.list(), old=rows.find(r=>r.method===method&&JSON.stringify(r.params)===JSON.stringify(params)&&JSON.stringify(r.scope)===JSON.stringify(scope));if(old)return old;
  if(method.startsWith('roleSession.') && (!preflightHash || !/^[a-f0-9]{64}$/.test(preflightHash)))throw Error('PREFLIGHT_REQUIRED');
  const record:PendingRecord={recordId:crypto.randomUUID(),identity:this.identity,method,params,operationId:'op_'+crypto.randomUUID(),expectedRevision:revision,scope,createdAt:Date.now(),state:'submitting'};
  if(method.startsWith('roleSession.')||method==='participant.slot.create')record.requestKey=record.operationId;
  if(method.startsWith('roleSession.'))record.preflightHash=preflightHash;
  this.write([...rows,record]);return record;
 }
 markUncertain(id:string){this.write(this.list().map(r=>r.recordId===id?{...r,state:'uncertain'}:r));}
 remove(id:string){this.write(this.list().filter(r=>r.recordId!==id));}
 metadata(){return this.list().map(({params,...r})=>r);}
 migrateLegacy(){
  if(this.identity.mode!=='LOCAL_CORE'||this.identity.clientId!=='workbench')return;
  const key='agentrouter.pending:'+this.identity.dataId, raw=this.storage.getItem(key);if(!raw)return;
  const old=JSON.parse(raw) as Record<string,{operationId:string;expectedRevision:number;scope:Scope}>;
  const rows=this.list();
  for(const [payload,command] of Object.entries(old)){
   const {method,params}=JSON.parse(payload);
   if(typeof command.operationId!=='string'||!Number.isInteger(command.expectedRevision)||!command.scope)throw Error('LEGACY_PENDING_NEEDS_REVIEW');
   if(!rows.some(r=>r.operationId===command.operationId))rows.push({recordId:crypto.randomUUID(),identity:this.identity,method,params,...command,createdAt:Date.now(),state:'uncertain'});
  }
  this.write(rows);
  if(this.list().length!==rows.length)throw Error('PENDING_MIGRATION_FAILED');
  this.storage.setItem('agentrouter.pending-migration-backup:'+crypto.randomUUID(),JSON.stringify({identity:this.identity,source:raw}));
  this.storage.removeItem(key);
 }
}
