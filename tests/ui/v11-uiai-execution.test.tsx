import {readFileSync} from 'node:fs';
import React from 'react';
import {describe,expect,it} from 'vitest';
import {makeStore,render} from './helpers.tsx';
import {Shell} from '../../apps/desktop/workbench/shell.tsx';
import {ProjectPage} from '../../apps/desktop/workbench/pages-project.tsx';
import {RolePage} from '../../apps/desktop/workbench/pages-role.tsx';

describe('V1.1 UIAI 执行包语义门禁',()=>{
 it('Workbench 先展示 Needs Attention，再展示 Roles 与 Running / Queue',()=>{
  const html=render(makeStore({}),<ProjectPage projectId="proj_atlas"/>);
  const attention=html.indexOf('需要关注'),roles=html.indexOf('>角色<'),work=html.indexOf('进行中与队列');
  expect(attention).toBeGreaterThan(-1);
  expect(attention).toBeLessThan(roles);
  expect(roles).toBeLessThan(work);
 });

 it('Results 把 Delivery、Acceptance 与 Artifact Evidence 分开展示',()=>{
  const html=render(makeStore({}),<ProjectPage projectId="proj_atlas" tab="inbox"/>);
  expect(html).toContain('交付');
  expect(html).toContain('验收');
  expect(html).toContain('Artifacts / Evidence');
  expect(html).toContain('Artifact 可读、测试通过与用户接受是不同事实');
 });

 it('Role 默认层包含 Identity、WorkSession、Current Work 与 secondary Conversation',()=>{
  const html=render(makeStore({}),<RolePage roleId="role_zhou"/>);
  for(const label of ['ROLE IDENTITY','当前 WorkSession','CURRENT WORK','Conversation · 业务记录与技术事件'])expect(html).toContain(label);
 });

 it('Shell 顶部常驻 Core/Host 与 Controller/Observer 身份',()=>{
  const html=render(makeStore({}),<Shell><div/></Shell>);
  expect(html).toContain('data-testid="core-identity"');
  expect(html).toContain('This PC');
  expect(html).toContain('Local · Connected · Controller');
 });

 it('Mobile intervention console 不使用浏览器 prompt/confirm/alert',()=>{
  const source=readFileSync('packages/remote/console.html','utf8');
  expect(source).not.toMatch(/\b(?:prompt|confirm|alert)\s*\(/u);
  expect(source).toContain('role="dialog"');
  expect(source).toContain('Historical · Read-only');
  expect(source).toContain('UNKNOWN · 请核对，勿盲目重试');
 });
});
