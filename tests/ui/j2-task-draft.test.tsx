import React from 'react';
import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {compileTask,emptyTaskDraft,maySupplement} from '../../apps/desktop/workbench/task-draft.ts';
import {SafeText} from '../../apps/desktop/workbench/safe-text.tsx';
import {roles,tasks} from '../../packages/ui-mocks/data.ts';
it('J2 新任务编译显式目标，不抄送；handoff 必须明确下一步',()=>{
 const r=roles[0],peer=roles.find(x=>x.id!==r.id&&x.spaceId===r.spaceId)!;
 const d={...emptyTaskDraft(),body:'核对资料',target:peer.id};expect(compileTask(r,d,roles).completion).toEqual({mode:'result',to:{type:'role',id:peer.id}});
 expect(()=>compileTask(r,{...d,handoff:true},roles)).toThrow('下一步');expect(compileTask(r,{...d,handoff:true,instruction:'复核来源并给出结论'},roles).completion).toMatchObject({instruction:'复核来源并给出结论'});
 expect(()=>compileTask(r,{...d,target:roles.find(x=>x.spaceId!==r.spaceId)!.id},roles)).toThrow('同一小组');
});
it('J2 只接受明确用户补充等待，RUNNING/等待依赖不能补充',()=>{const t={...tasks[0],state:'WAITING_INPUT' as const};expect(maySupplement(t)).toBe(false);expect(maySupplement({...t,blockedReason:'WAITING_FOR_USER_INPUT'})).toBe(true);expect(maySupplement({...t,state:'ACTIVE',blockedReason:'WAITING_FOR_USER_INPUT'})).toBe(false);});
it('J2 Markdown/代码仅文本，危险 HTML 与链接不能执行或自动打开',()=>{const html=renderToStaticMarkup(<SafeText text={'**证据**\n```js\nalert(1)\n```\n<script>danger()</script> [link](javascript:danger())'}/>);expect(html).toContain('<strong>证据</strong>');expect(html).toContain('<pre><code>');expect(html).not.toContain('<script>');expect(html).not.toContain('<a ');});
