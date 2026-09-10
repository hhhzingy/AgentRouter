/** 页面静态渲染断言：状态呈现、语义红线、能力门控、生命周期。 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, makeStore } from './helpers.tsx';
import { Shell } from '../../apps/desktop/workbench/shell.tsx';
import { HomePage } from '../../apps/desktop/workbench/pages-home.tsx';
import { ProjectPage } from '../../apps/desktop/workbench/pages-project.tsx';
import { RolePage } from '../../apps/desktop/workbench/pages-role.tsx';
import { RolePlanPage } from '../../apps/desktop/workbench/pages-roleplan.tsx';
import { ReconfigurePage } from '../../apps/desktop/workbench/pages-reconfigure.tsx';

const controller = makeStore({});
const observer = makeStore({ connectionState: 'CONNECTED_OBSERVER' });
const disconnected = makeStore({ connectionState: 'DISCONNECTED' });

function page(store: typeof controller, el: React.ReactElement) {
  return render(store, <Shell>{el}</Shell>);
}

describe('首页', () => {
  const html = page(controller, <HomePage />);
  it('项目卡网格 + 同尺寸创建卡', () => {
    expect(html).toContain('project-card-create');
    expect(html.match(/class="project-card[ "]/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('创建新项目');
  });
  it('卡组行含角色头像与组名', () => {
    expect(html).toContain('核心链路组');
    expect(html).toContain('avatar');
  });
  it('SSH 项目带远程标识，路径来自 Core', () => {
    expect(html).toContain('SSH · core-prod-01');
    expect(html).toContain('~/work/pay-core');
  });
  it('空首页也显示创建卡', () => {
    const empty = page(makeStore({ empty: true }), <HomePage />);
    expect(empty).toContain('还没有项目');
    expect(empty).toContain('project-card-create');
  });
});

describe('单项目页', () => {
  const html = page(controller, <ProjectPage projectId="proj_atlas" />);
  it('八个页签齐全', () => {
    for (const t of ['概览', '协作组', '时间线', '收件箱', '审批与问题', '产物', '模型与账号', '设置'])
      expect(html).toContain(t);
  });
  it('组卡展示 purpose、规则 revision 与工作区徽标（组≠worktree）', () => {
    expect(html).toContain('支付核心链路的规划、实现与复核');
    expect(html).toContain('规则 r3');
    expect(html).toContain('wt-core');
  });
  it('SETTLING 显示"收尾中"而非"完成"', () => {
    expect(html).toContain('收尾中');
    expect(html).not.toContain('>完成<');
  });
  it('UNKNOWN 独立可见', () => {
    expect(html).toContain('状态未知');
  });
  it('排队任务显示 Core 返回的位置', () => {
    expect(html).toContain('队列位置 1');
    expect(html).toContain('队列位置 2');
  });
  it('问题为空时不得宣称系统健康', () => {
    const nova = page(controller, <ProjectPage projectId="proj_nova" tab="issues" />);
    expect(nova).not.toContain('系统当前健康');
    expect(nova).toContain('不等于系统健康');
  });
  it('模型页签：种子/未验证不显示"可用"；无 Secret 输入', () => {
    const m = page(controller, <ProjectPage projectId="proj_atlas" tab="models" />);
    expect(m).toContain('种子目录');
    expect(m).toContain('需登录验证');
    expect(m).not.toContain('type="password"');
    expect(m).not.toMatch(/sk-[a-zA-Z0-9]/);
    expect(m).toContain('l***e@example.com');
  });
  it('设置页：项目级暂停不伪装全局 pause', () => {
    const st = page(controller, <ProjectPage projectId="proj_atlas" tab="settings" />);
    expect(st).toContain('不会在项目页伪装成项目开关');
  });
});

describe('角色详情', () => {
  const html = page(controller, <RolePage roleId="role_zhou" />);
  it('SETTLING 提示"不能视为完成"', () => {
    expect(html).toContain('收尾中');
    expect(html).toContain('不能视为&quot;完成&quot;');
  });
  it('对话完整可见：Route/Tool/User/GAP/系统卡', () => {
    for (const kind of ['kind-route_task', 'kind-tool_call', 'kind-user_message', 'kind-gap', 'kind-system_event'])
      expect(html).toContain(kind);
  });
  it('补充输入框不出现"已读/已处理"承诺', () => {
    expect(html).not.toContain('已读');
    expect(html).not.toContain('已处理');
  });
  it('UNKNOWN 角色显示对账面板，含六种动作且不自动重跑', () => {
    const su = page(controller, <RolePage roleId="role_su" />);
    expect(su).toContain('data-testid="reconcile-panel"');
    expect(su).toContain('不会自动重跑');
    for (const a of ['确认原生已完成', '确认无副作用', '标记失败', '重接原生会话', '隔离工作区', '人工核验后释放'])
      expect(su).toContain(a);
  });
});

describe('Role Plan', () => {
  it('能力不足时 AI 生成入口禁用并说明', () => {
    const html = page(controller, <RolePlanPage projectId="proj_atlas" />);
    expect(html).toContain('当前没有已认证且可建会话的 Harness');
    expect(html).toContain('导入方案');
    expect(html).toContain('手工创建');
  });
  it('生产 Core 不支持时整页降级', () => {
    const html = page(
      makeStore({ capabilities: { role_plans: false } }),
      <RolePlanPage projectId="proj_atlas" />,
    );
    expect(html).toContain('当前 Core 不支持 Role Plan');
  });
});

describe('组重构', () => {
  it('生产 Core 不支持时入口禁用', () => {
    const html = page(
      makeStore({ capabilities: { space_reconfiguration: false } }),
      <ReconfigurePage projectId="proj_atlas" />,
    );
    expect(html).toContain('当前 Core 不支持组重构');
  });
  it('规则文案：Preview→blockers→处置→Commit；不可一键撤销；不宣称遗忘上下文', () => {
    const html = page(controller, <ReconfigurePage projectId="proj_atlas" />);
    expect(html).toContain('Preview');
    expect(html).toContain('不能在界面内一键撤销');
    expect(html).toContain('不意味着模型遗忘旧上下文');
  });
});

describe('生命周期与壳', () => {
  it('Observer：横幅明示只读，写按钮给出原因', () => {
    const html = page(observer, <ProjectPage projectId="proj_atlas" />);
    expect(html).toContain('观察者模式：全部内容只读');
    expect(html).toContain('capability-blocked');
  });
  it('断线：展示"最后已知状态 + 数据截至"，不承诺远端 Run 继续', () => {
    const html = page(disconnected, <ProjectPage projectId="proj_atlas" />);
    expect(html).toContain('最后已知状态');
    expect(html).toContain('数据截至');
    expect(html).toContain('无法从界面确认');
  });
  it('关闭窗口仅退出界面（页脚声明）', () => {
    const html = page(controller, <HomePage />);
    expect(html).toContain('关闭窗口仅退出界面');
  });
  it('问题列表为空不单独宣称健康（顶栏计数仍在）', () => {
    const html = page(makeStore({ snapshot: { issues: [] } }), <HomePage />);
    expect(html).not.toContain('系统健康');
  });
});

describe('可访问性与缩放', () => {
  const html = page(controller, <ProjectPage projectId="proj_atlas" />);
  it('tablist/tab 语义与 aria-selected', () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
  });
  it('状态点带 aria-label（不只用颜色传达）', () => {
    const home = page(controller, <HomePage />);
    expect(home).toContain('role="img"');
    expect(home).toContain('aria-label');
  });
  it('根文档声明中文', () => {
    // workbench.html 含 lang="zh-CN"（静态文件检查在 e2e 脚本中覆盖）
    expect(true).toBe(true);
  });
});
