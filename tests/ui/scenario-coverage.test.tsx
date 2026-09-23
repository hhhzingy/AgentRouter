import {ConversationView} from '../../apps/desktop/workbench/composites.tsx';
/**
 * Phase A 28 场景等价覆盖（docs/ui/09_mock-scenarios.md → UI Baseline V1）。
 * 每个 sc 断言在当前基线中的对应呈现/行为。
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, makeStore, D } from './helpers.tsx';
import { connectPreview } from '../../packages/ui-mocks/client.ts';
import { HomePage } from '../../apps/desktop/workbench/pages-home.tsx';
import { ProjectPage } from '../../apps/desktop/workbench/pages-project.tsx';
import { RolePage } from '../../apps/desktop/workbench/pages-role.tsx';
import { ReconfigurePage } from '../../apps/desktop/workbench/pages-reconfigure.tsx';
import { Shell } from '../../apps/desktop/workbench/shell.tsx';

const controller = makeStore({});
const page = (el: React.ReactElement, store = controller) => render(store, <Shell>{el}</Shell>);

describe('28 场景等价覆盖', () => {
  it('sc-01 空首页：空状态 + 同尺寸创建卡', () => {
    const html = page(<HomePage />, makeStore({ empty: true }));
    expect(html).toContain('还没有项目');
    expect(html).toContain('project-card-create');
  });
  it('sc-02 多项目：两张项目卡 + 创建卡同网格', () => {
    const html = page(<HomePage />);
    expect(html).toContain('支付中台重构');
    expect(html).toContain('官网改版');
    expect(html).toContain('创建新项目');
  });
  it('sc-03 Local 单组项目：Core 身份位于顶栏且显示单组', () => {
    const html = page(<ProjectPage projectId="proj_nova" />);
    expect(html).toContain('Local · Connected · Controller');
    expect(html).toContain('站点组');
  });
  it('sc-04 SSH 项目：⌁ 标识与远程路径', () => {
    const html = page(<HomePage />);
    expect(html).toContain('SSH · core-prod-01');
  });
  it('sc-05 双隔离组：组是通信边界，页面并列两组', () => {
    const html = page(<ProjectPage projectId="proj_atlas" tab="spaces" />);
    expect(html).toContain('核心链路组');
    expect(html).toContain('增长实验组');
    expect(html).toContain('跨组角色不能直接通信');
  });
  it('sc-06 组内三角色：核心链路组 3 角色齐全', () => {
    const html = page(<ProjectPage projectId="proj_atlas" />);
    for (const n of ['林岚', '周实现', '陈复核']) expect(html).toContain(n);
  });
  it('sc-07 跨组 Route 拒绝：同组联系人才出现在 Charter 目录', () => {
    const charter = D.charterFor(D.roles[1]); // 周实现
    expect(charter.directory.map((d) => d.displayName)).toEqual(['林岚', '陈复核']);
    expect(charter.directory.map((d) => d.displayName)).not.toContain('苏界面');
  });
  it('sc-08 双组并行：两组独立计数', () => {
    const core = D.spaces.find((s) => s.id === 'sp_core')!;
    const growth = D.spaces.find((s) => s.id === 'sp_growth')!;
    expect(core.activeRunsCount).toBe(2);
    expect(growth.queuedTasksCount).toBe(2);
  });
  it('sc-09 活跃 Run：概览显示执行中/活跃计数', () => {
    const html = page(<ProjectPage projectId="proj_atlas" />);
    expect(html).toContain('活跃 Run');
  });
  it('sc-10 SETTLING：显示"收尾中"≠完成', () => {
    const html = page(<RolePage roleId="role_zhou" />);
    expect(html).toContain('收尾中');
    expect(html).not.toContain('>已完成<');
  });
  it('sc-11 等待审批：审批卡与高风险徽标', () => {
    const html = page(<ProjectPage projectId="proj_atlas" tab="issues" />);
    expect(html).toContain('允许访问支付网关沙箱配置');
    expect(html).toContain('高风险');
  });
  it('sc-12 需介入：问题 + 需要关注任务可见', () => {
    const html = page(<ProjectPage projectId="proj_atlas" />);
    expect(html).toContain('需要关注');
    expect(html).toContain('待介入');
  });
  it('sc-13 UNKNOWN：独立状态 + 对账入口，不自动重跑', () => {
    const html = page(<RolePage roleId="role_su" />);
    expect(html).toContain('状态未知');
    expect(html).toContain('不会自动重跑');
  });
  it('sc-14 排队：位置 1/2 由 Core 给出', () => {
    const html = page(<ProjectPage projectId="proj_atlas" />);
    expect(html).toContain('队列位置 1');
    expect(html).toContain('队列位置 2');
  });
  it('sc-15 等待子任务结果：任务链 sourceTaskId 可溯', () => {
    const review = D.tasks.find((t) => t.id === 'task_review')!;
    expect(review.sourceTaskId).toBe('task_refund');
  });
  it('sc-16 结果给用户：收件箱只收显式结果', () => {
    const html = page(<ProjectPage projectId="proj_atlas" tab="inbox" />);
    expect(html).toContain('退款幂等改造复核通过');
    expect(html).toContain('待验收');
  });
  it('sc-17 交接：完成去向在任务行可见', () => {
    const html = page(<ProjectPage projectId="proj_atlas" />);
    expect(html).toContain('去向：陈复核');
  });
  it('sc-18 合法方案可导入（schema_version 校验）', async () => {
    const c = await connectPreview('full');
    const v = (await c.request('rolePlan.validate', { plan: D.samplePlan } as never)) as { valid: boolean };
    expect(v.valid).toBe(true);
  });
  it('sc-19 方案错误：组引用缺失报 GROUP_NOT_FOUND', async () => {
    const bad = structuredClone(D.samplePlan);
    bad.roles[0].group_key = 'g_missing';
    const c = await connectPreview('full');
    const v = (await c.request('rolePlan.validate', { plan: bad } as never)) as {
      valid: boolean;
      errors: Array<{ code: string }>;
    };
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.code === 'GROUP_NOT_FOUND')).toBe(true);
  });
  it('sc-20 越权请求：custom_request 必须逐项确认', async () => {
    const c = await connectPreview('full');
    const v = (await c.request('rolePlan.validate', { plan: D.samplePlan } as never)) as {
      requiredConfirmations: string[];
    };
    expect(v.requiredConfirmations.length).toBeGreaterThan(0);
  });
  it('sc-21 模型需登录：REQUIRES_LOGIN 不显示"可用"', () => {
    const html = page(<ProjectPage projectId="proj_atlas" tab="models" />);
    expect(html).toContain('需登录验证');
    const seedRow = html.split('pi-pro')[1];
    expect(seedRow).not.toContain('>可用<');
  });
  it('sc-22 种子目录：SEED 来源徽标', () => {
    const html = page(<ProjectPage projectId="proj_atlas" tab="models" />);
    expect(html).toContain('种子目录');
  });
  it('sc-23 合并阻断：blockers 非空不可 Commit', async () => {
    const c = await connectPreview('full');
    const pv = (await c.request('space.reconfigure.preview', { plan: {} } as never)) as {
      blockers: unknown[];
    };
    expect(pv.blockers.length).toBeGreaterThan(0);
    await expect(
      c.request('space.reconfigure.commit', { plan_id: 'rcfg_01', plan_hash: 'h', confirmed: [] } as never),
    ).rejects.toMatchObject({ code: 'RECONFIGURATION_BLOCKED' });
  });
  it('sc-24 拆组会话策略：合同枚举存在且 UI 不宣称上下文遗忘', () => {
    const html = page(<ReconfigurePage projectId="proj_atlas" />);
    expect(html).toContain('不意味着模型遗忘旧上下文');
  });
  it('sc-25 SSH 断线：最后已知状态 + 数据截至，不承诺远端继续', () => {
    const html = page(<ProjectPage projectId="proj_atlas" />, makeStore({ connectionState: 'DISCONNECTED' }));
    expect(html).toContain('最后已知状态');
    expect(html).toContain('数据截至');
    expect(html).toContain('无法从界面确认');
  });
  it('sc-26 Observer：全界面只读', () => {
    const html = page(<ProjectPage projectId="proj_atlas" />, makeStore({ connectionState: 'CONNECTED_OBSERVER' }));
    expect(html).toContain('观察者模式：全部内容只读');
  });
  it('sc-27 历史缺口：GAP 卡可见', () => {
    const html = page(<ConversationView items={D.conversation} now={D.FIXED_NOW}/>);
    expect(html).toContain('kind-gap');
    expect(html).toContain('对话存在缺口');
  });
  it('sc-28 账号切换：脱敏展示 + 切换按钮，无 Secret 输入', () => {
    const html = page(<ProjectPage projectId="proj_atlas" tab="models" />);
    expect(html).toContain('切换到此账号');
    expect(html).toContain('l***e@example.com');
    expect(html).not.toContain('type="password"');
  });
});
