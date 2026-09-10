import React, {useEffect, useRef, useState} from 'react';
import type {ConversationItemVM,Scope} from '../../../packages/client-contract/c1r1p1/generated.ts';
import {useStore} from './store.tsx';
import {ConversationView} from './composites.tsx';
import {errorMessage} from './action-state.ts';
export function HistoryPanel({scope,roleId}:{scope:Scope;roleId?:string}) {
 const s=useStore();
 const key=JSON.stringify([s.hello.serverInstanceId,scope,roleId]);
 return <ScopedHistory key={key} scope={scope} roleId={roleId}/>;
}
function ScopedHistory({scope,roleId}:{scope:Scope;roleId?:string}) {
 const s=useStore(), [items,setItems]=useState<ConversationItemVM[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[more,setMore]=useState(false),[loaded,setLoaded]=useState(false),[newItems,setNewItems]=useState(false);
 const alive=useRef(true), inflight=useRef(false), cursor=useRef<string|undefined>(undefined), initialCursor=useRef(s.snapshot.cursor);
 async function load() {
  if(inflight.current)return; inflight.current=true;setBusy(true);setError(null);
  try {
   const page=await s.call('conversation.read',{scope,limit:100,...(roleId?{role_id:roleId}:{}),...(cursor.current?{after_id:cursor.current}:{})});
   if(!alive.current)return;
   setItems(old=>[...new Map([...old,...page.items].map(x=>[x.id,x])).values()]);
   if(page.items.length)cursor.current=page.next_id??undefined;
   setMore(page.has_more);setLoaded(true);setNewItems(false);
  }catch(e){if(alive.current)setError(e);}finally{inflight.current=false;if(alive.current)setBusy(false);}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(s.snapshot.cursor!==initialCursor.current){setNewItems(true);initialCursor.current=s.snapshot.cursor;}},[s.snapshot.cursor]);
 return <section className="history-panel" aria-label="历史记录">
  <p className="muted">按时间从最早开始，已加载 {items.length} 条；{more?'还有后续记录':'已知范围以本次读取为准'}。</p>
  {Boolean(error) && <div role="alert" className="hint tone-danger">{errorMessage(error)} 读取失败不代表没有记录。<button onClick={()=>void load()}>重试读取</button><details><summary>技术详情</summary>{String(error)}</details></div>}
  {busy && <p role="status">正在读取记录…</p>}
  {loaded && !error && items.length===0 && <p>此范围暂无记录。</p>}
  {items.length>0 && <ConversationView items={items} now={s.now()}/>}
  {(more||newItems) && <button className="btn btn-secondary" disabled={busy} onClick={()=>void load()}>{more?'加载更多记录':'有新消息，继续读取'}</button>}
 </section>;
}
