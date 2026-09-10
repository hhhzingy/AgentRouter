import React,{useRef,useState} from 'react';
import type {Method,MethodMap} from '../../../packages/client-contract/c1r1p1/generated.ts';
import {useStore} from './store.tsx';
import {errorMessage,failureState,actionTone,type ActionState} from './action-state.ts';
export function CommandButton<M extends Method>({method,params,children}:{method:M;params:MethodMap[M]['params'];children:React.ReactNode}){
 const s=useStore(),lock=useRef(false),[state,setState]=useState<ActionState>('idle'),[note,setNote]=useState('');
 const supported=s.capabilities.methods.includes(method);
 return <span><button className="btn" disabled={s.readOnly||!supported||state==='submitting'} onClick={async()=>{if(lock.current)return;lock.current=true;setState('submitting');try{await s.call(method,params);setState('succeeded');setNote('操作已保存');}catch(e){setState(failureState(e));setNote(errorMessage(e));}finally{lock.current=false;}}}>{children}</button>{!supported&&<small>当前 Core 未开放此操作</small>}{note&&<span role="status" className={`tone-${actionTone(state)}`}>{note}</span>}</span>;
}
