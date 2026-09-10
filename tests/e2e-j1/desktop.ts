import { _electron as electron, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startCore, until } from '../w11-process-support.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
mkdirSync('.local/j1-tests', { recursive: true });
mkdirSync('evidence/J1/screenshots', { recursive: true });
const gui = mkdtempSync(resolve('.local/j1-tests/ui-')),
  data = resolve(gui, 'core'),
  projectPath = resolve(gui, '联验项目');
mkdirSync(data);
mkdirSync(projectPath);
let core!: Awaited<ReturnType<typeof startCore>>, app: any, page: any;
const checks: any[] = [];
const errors: string[] = [];
const pass = (id: string) => {
  checks.push({ id, status: 'PASS' });
  console.log(id);
};
async function launch() {
  app = await electron.launch({
    executablePath: resolve('node_modules/electron/dist/electron.exe'),
    args: [resolve('.local/desktop-w11/p1-main.mjs')],
    env: {
      SystemRoot: process.env.SystemRoot!,
      WINDIR: process.env.WINDIR!,
      PATH: process.env.PATH!,
      TEMP: gui,
      TMP: gui,
      AGENTROUTER_DATA: gui,
      AGENTROUTER_MODE: 'LOCAL_CORE',
    },
    timeout: 30000,
  });
  page = await app.firstWindow();
  page.on('pageerror', (e: Error) => errors.push(e.message));
  await page.waitForLoadState();
}
async function closeGui() {
  if (!app) return;
  const proc = app.process();
  await app.evaluate(({ BrowserWindow }: any) => BrowserWindow.getAllWindows()[0]?.close());
  if (proc.exitCode === null && proc.signalCode === null)
    await new Promise((r) => proc.once('exit', r));
  app = undefined;
}
const request = (role: string, completion: any = { mode: 'result', to: { type: 'user' } }) => ({
  kind: 'task.request',
  to: { type: 'role', id: role },
  summary: 'J1 下游工作',
  body: '隔离 Fixture 结果',
  inputs: [],
  expected: ['交付'],
  completion,
});
const finish = (next?: any) => ({
  tool: 'finish',
  payload: {
    outcome: 'succeeded',
    summary: 'J1 阶段交付',
    body: '仅模拟执行器',
    outputs: [],
    ...(next ? { next_request: next } : {}),
  },
});
try {
  core = await startCore(data);
  core.child.stderr?.on('data', (b) => console.error(String(b)));
  await core.session.request(
    'control.release',
    { lease_id: core.lease.leaseId },
    {
      operationId: 'op_ui_release',
      expectedRevision: (await core.session.request('system.snapshot', {})).revision,
      scope: {},
    },
  );
  await launch();
  await expect(page.getByRole('heading', { name: '项目', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择目录…' })).toBeDisabled();
  pass('J1_HOME_OBSERVER');
  await page.getByRole('button', { name: '申请控制' }).click();
  await expect(page.getByRole('button', { name: '选择目录…' })).toBeEnabled();
  await app.evaluate(({ dialog }: any, path: string) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, projectPath);
  await page.getByRole('button', { name: '选择目录…' }).click();
  await expect(page.locator('[data-page="project"]')).toBeVisible();
  const project = (await core.session.request('system.snapshot', {})).projects[0];
  expect(project.displayRoot).toBe(projectPath);
  pass('J1_NATIVE_PICKER_CORE_GRANT_PROJECT');
  await page.getByRole('button', { name: /编排角色/ }).click();
  const ws = (await core.session.request('workspace.list', { project_id: project.id })).items[0];
  const plan = structuredClone(seed);
  plan.project_id = project.id;
  for (const g of plan.groups) g.workspace_ref = ws.id;
  for (const r of plan.roles) r.workspace_ref = ws.id;
  const planPath = resolve(gui, 'plan.json');
  writeFileSync(planPath, JSON.stringify(plan));
  await page.getByLabel('导入 Role Plan JSON').setInputFiles(planPath);
  await expect(page.locator('[data-stage="review"]')).toBeVisible();
  await page.screenshot({ path: 'evidence/J1/screenshots/01-plan-review.png', fullPage: true });
  for (const checkbox of await page.locator('.confirm-row input').all()) await checkbox.check();
  await page.getByRole('button', { name: '确认并应用' }).click();
  await expect(page.locator('[data-stage="applied"]')).toBeVisible();
  await page.getByRole('button', { name: '返回项目' }).click();
  let snap = await core.session.request('system.snapshot', {});
  expect(snap.spaces).toHaveLength(2);
  expect(snap.roles).toHaveLength(6);
  expect(snap.roles.every((r) => r.bootstrapState === 'PENDING')).toBe(true);
  await page.screenshot({ path: 'evidence/J1/screenshots/02-two-groups.png', fullPage: true });
  pass('J1_ROLEPLAN_ATOMIC_PENDING_TWO_GROUPS');
  const group = snap.spaces[0];
  const [a, b, c] = snap.roles.filter((r) => r.spaceId === group.id);
  const nextC = request(c.id),
    nextB = request(b.id, { mode: 'handoff', to: { type: 'role', id: c.id }, instruction: '复核' });
  for (const [role, steps] of [
    [a, [finish(nextB)]],
    [b, [finish(nextC)]],
    [c, [finish()]],
  ] as const) {
    await core.control('configureFixture', {
      roleId: role.id,
      scenario: {
        steps,
        delayMs: role.id === b.id ? 1600 : 20,
        exitDelayMs: role.id === b.id ? 1600 : 0,
        duplicate: true,
      },
    });
    await until(
      () => core.session.request('roleCharter.get', { project_id: project.id, role_id: role.id }),
      (v) => v.bootstrapState === 'DELIVERED',
    );
  }
  await page
    .getByRole('button', { name: `向 ${a.name} 派发任务` })
    .first()
    .click();
  const targets = await page
    .getByLabel('结果去向')
    .locator('option')
    .evaluateAll((options: any[]) => options.map((o) => o.value));
  expect(targets).toContain(b.id);
  for (const foreign of snap.roles.filter((r) => r.spaceId !== group.id))
    expect(targets).not.toContain(foreign.id);
  const close = page.getByRole('button', { name: '关闭', exact: true });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.drawer'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `向 ${a.name} 派发任务` }).first()).toBeFocused();
  pass('J1_CROSS_GROUP_TARGETS_AND_MODAL_KEYBOARD');
  await page
    .getByRole('button', { name: `向 ${a.name} 派发任务` })
    .first()
    .click();
  await page.getByLabel(/任务内容/).fill('J1 显式流水线');
  await page.getByLabel('结果去向').selectOption(b.id);
  await page.getByLabel('交接任务给目标角色').check();
  await page.getByRole('button', { name: '提交任务', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /已提交|已入队/ })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await until(
    () => core.control('inspect'),
    (v) =>
      v.runs.some((r: any) => r.role_id === b.id) && v.outbox.some((o: any) => o.state === 'HELD'),
  );
  expect((await core.control('inspect')).runs.some((r: any) => r.role_id === c.id)).toBe(false);
  await page.locator(`a[href="#/role/${b.id}"]`).first().click();
  await expect(page.locator('[data-page="role"]')).toBeVisible();
  await expect(page.getByText('收尾中', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'evidence/J1/screenshots/03-settling.png', fullPage: true });
  await until(
    () => core.session.request('inbox.list', {}),
    (v) => v.items.length === 1,
  );
  pass('J1_PIPELINE_HELD_NATIVE_BARRIER');
  const artifact = await core.control('createFixtureArtifact');
  await page.locator(`a[href="#/project/${project.id}"]`).first().click();
  await page.getByRole('tab', { name: '产物', exact: true }).click();
  await expect(page.getByText('j1-result.txt', { exact: true })).toBeVisible();
  const saved = resolve(gui, 'saved-artifact.txt');
  await app.evaluate(({ dialog }: any, path: string) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, saved);
  await page.getByRole('button', { name: '校验', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '校验状态：AVAILABLE' })).toBeVisible();
  await page.getByRole('button', { name: '保存产物…' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已保存并校验' })).toBeVisible();
  expect(readFileSync(saved, 'utf8')).toBe('J1 isolated artifact\n');
  pass('J1_ARTIFACT_VERIFIED_SAVE');
  await page.getByRole('button', { name: '转为只读' }).click();
  await expect(page.getByRole('button', { name: '保存产物…' })).toBeDisabled();
  await page.getByRole('button', { name: '申请控制' }).click();
  await page.getByRole('tab', { name: '概览', exact: true }).click();
  await core.control('configureFixture', { roleId: c.id, scenario: { delayMs: 1000 } });
  for (const title of ['J1 FIFO 1', 'J1 FIFO 2']) {
    await page
      .getByRole('button', { name: `向 ${c.name} 派发任务` })
      .first()
      .click();
    await page.getByLabel(/任务内容/).fill(title);
    if (title === 'J1 FIFO 2') await core.control('dropNextReply');
    await page.getByRole('button', { name: /提交任务|派发到队列/, exact: true }).click();
    if (title === 'J1 FIFO 2') {
      await expect(page.getByRole('status').filter({ hasText: 'REQUEST_TIMEOUT' })).toBeVisible({
        timeout: 15000,
      });
      const pending = await page.evaluate(() =>
        Object.entries(localStorage)
          .filter(([k]) => k.startsWith('agentrouter.pending:'))
          .map(([, v]) => JSON.parse(v)),
      );
      expect(pending.flatMap((r: any) => Object.values(r))).toHaveLength(1);
      await page.reload();
      await page.getByRole('button', { name: '申请控制' }).click();
      await page
        .getByRole('button', { name: `向 ${c.name} 派发任务` })
        .first()
        .click();
      await page.getByLabel(/任务内容/).fill(title);
      await page.getByRole('button', { name: /提交任务|派发到队列/, exact: true }).click();
      pass('J1_TIMEOUT_RELOAD_EXPLICIT_RETRY');
    }
    await expect(page.getByRole('status').filter({ hasText: /已提交|已入队/ })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
  }
  await until(
    () => core.session.request('inbox.list', {}),
    (v) => v.items.length === 3,
  );
  const fifo = await core.control('inspect');
  expect(
    fifo.tasks.filter((t: any) => t.summary.startsWith('J1 FIFO')).map((t: any) => t.summary),
  ).toEqual(['J1 FIFO 1', 'J1 FIFO 2']);
  pass('J1_UI_FIFO');
  await core.control('configureFixture', { roleId: c.id, scenario: { halfFrame: true } });
  await page
    .getByRole('button', { name: `向 ${c.name} 派发任务` })
    .first()
    .click();
  await page.getByLabel(/任务内容/).fill('J1 UNKNOWN');
  await page.getByRole('button', { name: '提交任务', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await until(
    () => core.control('inspect'),
    (v) => v.runs.some((r: any) => r.state === 'UNKNOWN'),
  );
  await page.locator(`a[href="#/role/${c.id}"]`).first().click();
  await expect(page.getByTestId('reconcile-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: '人工核验后释放' })).toBeDisabled();
  await page.screenshot({ path: 'evidence/J1/screenshots/04-unknown.png', fullPage: true });
  pass('J1_UNKNOWN_VISIBLE_CAPABILITY_GATED');
  await closeGui();
  await core.stop();
  core = await startCore(data);
  await core.session.request(
    'control.release',
    { lease_id: core.lease.leaseId },
    {
      operationId: 'op_ui_release',
      expectedRevision: (await core.session.request('system.snapshot', {})).revision,
      scope: {},
    },
  );
  await launch();
  await expect(page.locator('.project-card').filter({ hasText: '联验项目' })).toBeVisible();
  snap = await core.session.request('system.snapshot', {});
  expect(snap.roles).toHaveLength(6);
  expect(snap.runs).toHaveLength(6);
  expect(snap.runs.some((r) => r.state === 'UNKNOWN')).toBe(true);
  await app.evaluate(({ BrowserWindow }: any) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 720),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'evidence/J1/screenshots/05-home-restarted-1280.png',
    fullPage: true,
  });
  pass('J1_CORE_RESTART_PERSISTENCE');
  await page.reload();
  await expect(page.locator('.project-card').filter({ hasText: '联验项目' })).toBeVisible();
  expect((await core.control('inspect')).runs).toHaveLength(6);
  pass('J1_RENDERER_RELOAD_NO_REPLAY');
  expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
  expect(errors).toEqual([]);
  pass('J1_RENDERER_NO_NODE_ERRORS');
} catch (e) {
  checks.push({
    id: 'J1_DESKTOP',
    status: 'FAIL',
    error: e instanceof Error ? e.message : String(e),
  });
  console.error(e);
  console.error('renderer errors', errors);
  if (page)
    console.error(
      await page
        .locator('body')
        .innerText()
        .catch(() => ''),
    );
  if (page)
    await page
      .screenshot({ path: 'evidence/J1/screenshots/failure.png', fullPage: true, timeout: 5000 })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  await closeGui().catch(() => {});
  await core?.stop();
  writeFileSync(
    'evidence/J1/desktop.json',
    JSON.stringify(
      {
        backend: 'REAL_ELECTRON_LOCAL_CORE',
        executor: 'SIMULATED_PROCESS',
        nativeDialogTest:
          'Main dialog selection return controlled by test; OS dialog interaction not manually tested',
        realHarnessSupport: 0,
        checks,
      },
      null,
      2,
    ) + '\n',
  );
}
