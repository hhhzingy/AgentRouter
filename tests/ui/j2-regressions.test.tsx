import React from 'react';
import { it, expect } from 'vitest';
import { makeStore, render } from './helpers.tsx';
import { RolePlanPage } from '../../apps/desktop/workbench/pages-roleplan.tsx';
import { RolePage } from '../../apps/desktop/workbench/pages-role.tsx';
import { ProjectPage } from '../../apps/desktop/workbench/pages-project.tsx';
import { Composer } from '../../apps/desktop/workbench/composites.tsx';

// J2-0：这些测试在 J1 上复现已知缺陷。修复对应实现后移除 fails。
it('J2 AI 可建会话仍不能启用未实现的规划处理器', () => {
 const s = makeStore({});
 for (const h of Object.values(s.capabilities.harnesses)) { h.status = 'CERTIFIED'; h.create_session = true; }
 const html = render(s, <RolePlanPage projectId={s.snapshot.projects[0].id} />);
 expect(html.match(/<button([^>]*)>开始 AI 生成…/u)?.[1]).toContain('disabled');
});
it('J2 未取得权威 workspaceId 时不能按同名显示另一项目路径', () => {
 const s = makeStore({}); const role = s.snapshot.roles[0];
 s.snapshot.workspaces = [{id:'wrong_ws',projectId:'other_project',label:role.workspaceLabel,kind:'DIRECTORY',displayPath:'WRONG_PROJECT_DIRECTORY',status:'READY',access:'READ_ONLY',revision:1}];
 expect(render(s, <RolePage roleId={role.id} />)).not.toContain('WRONG_PROJECT_DIRECTORY');
});
it('J2 无 role 的全局事件不能当作每个项目的活动', () => {
 const s = makeStore({}); s.timeline = [{id:'foreign_event',kind:'system',occurredAtMs:1,body:'FOREIGN_PROJECT_EVENT',replay:false,sensitive:false}];
 expect(render(s, <ProjectPage projectId={s.snapshot.projects[0].id} tab="timeline" />)).not.toContain('FOREIGN_PROJECT_EVENT');
});
it('J2 空闲角色可以填写新任务而不是只保留灰色补充框', () => {
 const s = makeStore({snapshot:{tasks:[],runs:[]}}), role = s.snapshot.roles[0];
 const html = render(s, <Composer role={role} spaceId={role.spaceId} />);
 expect(html.match(/<textarea([^>]*)>/u)?.[1]).not.toContain('disabled');
});
