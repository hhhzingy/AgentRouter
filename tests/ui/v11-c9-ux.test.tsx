import React from 'react';
import { it, expect } from 'vitest';
import { makeStore, render } from './helpers.tsx';
import { Shell } from '../../apps/desktop/workbench/shell.tsx';
import { HomePage } from '../../apps/desktop/workbench/pages-home.tsx';
import { ProjectPage } from '../../apps/desktop/workbench/pages-project.tsx';
import { RolePage } from '../../apps/desktop/workbench/pages-role.tsx';
import { RemoteDevicesPage } from '../../apps/desktop/workbench/pages-remote.tsx';

it('C9:顶栏唯一 Core 身份清楚可见，原始标识不占默认界面', () => {
  const html = render(makeStore({}), <Shell><HomePage /></Shell>);
  expect(html).toContain('data-testid="core-identity"');
  expect(html).toContain('This PC');
  expect(html).toContain('Local · Connected · Controller');
});

it('C9:项目页把需要关注与受阻原因单独列出', () => {
  const html = render(makeStore({}), <ProjectPage projectId="proj_atlas" />);
  expect(html).toContain('需要关注');
  expect(html).toContain('data-testid="needs-attention"');
  expect(html).toContain('data-testid="blocked-reason"');
  expect(html).toContain('Run 状态未知，需要对账');
});

it('C9:角色页同时有工作会话与槽位绑定，不把 Slot 伪装成执行槽', () => {
  const html = render(makeStore({}), <RolePage roleId="role_zhou" />);
  expect(html).toContain('工作会话');
  expect(html).toContain('槽位与绑定');
  expect(html).toContain('历史 WorkSession 只读');
});

it('C9:连接页区分管理客户端、参与者与设备，未启用网关时阻断配对', () => {
  const html = render(makeStore({}), <RemoteDevicesPage />);
  expect(html).toContain('<h1>连接</h1>');
  expect(html).toContain('本机远程网关尚未启用');
  expect(html).toContain('管理客户端');
  expect(html).toContain('参与者');
  expect(html).toContain('capability-blocked');
});

it('C9:成果页展示产物 id，验收动作不伪装成已完成', () => {
  const html = render(makeStore({}), <ProjectPage projectId="proj_atlas" tab="inbox" />);
  expect(html).toContain('待验收');
  expect(html).not.toContain('已自动完成');
});
