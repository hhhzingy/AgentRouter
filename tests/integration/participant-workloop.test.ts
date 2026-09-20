import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import Database from 'better-sqlite3';

it(
  'P4 外接角色工作环:结构化收件箱(nonce 经工具读取)+claim→产物→结果提交(验收仍是人类)+WAITING_INPUT 往返(幂等/冲突/继续推进)',
  { timeout: 120000 },
  async () => {
    mkdirSync('.local/w11-tests', { recursive: true });
    const dir = mkdtempSync(resolve('.local/w11-tests/workloop-'));
    mkdirSync(resolve(dir, 'workspace'), { recursive: true });
    const core = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: '',
        TEMP: dir,
        TMP: dir,
        AGENTROUTER_DATA: resolve(dir, 'core'),
        AGENTROUTER_PROJECT_ROOTS: JSON.stringify([resolve(dir, 'workspace')]),
      },
    });
    const coreErr: string[] = [];
    core.stderr?.on('data', (d) => coreErr.push(d.toString()));
    for (let i = 0; i < 60 && !existsSync(resolve(dir, 'core/endpoint.json')); i++)
      await new Promise((r) => setTimeout(r, 100));
    await build({
      entryPoints: ['packages/client-transport/p1/local.ts'],
      outfile: resolve(dir, 'transport.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
    });
    const { LocalCoreTransport } = await import(pathToFileURL(resolve(dir, 'transport.mjs')).href);
    const setup = new LocalCoreTransport(resolve(dir, 'core'));
    const s = await setup.connect({
      clientId: 'wl_setup',
      clientVersion: '1.0.0',
      requestedMode: 'controller',
      contractRevision: 'C1R1P1',
      mode: 'LOCAL_CORE',
    });
    const snap = () => s.request('system.snapshot', {});
    const lease = await s.request(
      'control.acquire',
      {},
      { operationId: 'wl_lease', expectedRevision: (await snap()).revision, scope: {} },
    );
    const mutate = async (method: string, params: any, scope: any, op: string) =>
      s.request(method as never, params, {
        operationId: op,
        scope,
        expectedRevision: (await snap()).revision,
        leaseId: (lease as any).leaseId,
      });
    const roots = await s.request('filesystem.listRoots', {});
    const project = (await mutate(
      'project.create',
      { name: 'P4工作环', path_handle: roots.items[0].pathHandle },
      {},
      'project',
    )) as any;
    const ws = (await s.request('workspace.list', { project_id: project.id })).items[0];
    const plan = JSON.parse(readFileSync('fixtures/client-c1r1/two-groups.plan.json', 'utf8'));
    plan.project_id = project.id;
    plan.groups = plan.groups.slice(0, 1);
    plan.roles = plan.roles.slice(0, 1);
    plan.groups[0].workspace_ref = ws.id;
    plan.roles[0].workspace_ref = ws.id;
    const v = await s.request('rolePlan.validate', { plan });
    await mutate(
      'rolePlan.apply',
      {
        plan,
        plan_hash: v.planHash,
        confirmed: true,
        permission_grants: [
          { role_key: plan.roles[0].role_key, permissions: plan.roles[0].requested_permissions },
        ],
      },
      { project_id: project.id },
      'apply',
    );
    const roleId = ((await s.request('role.list', { scope: { project_id: project.id } })) as any)
      .items[0].id;
    let spaceId = '';
    {
      const db0 = new Database(resolve(dir, 'core/router.db'), { readonly: true });
      spaceId = (db0.prepare('select space_id from roles where id=?').get(roleId) as any).space_id;
      db0.close();
    }
    const grant = await s.request(
      'participant.grant.issue' as never,
      { role_id: roleId } as never,
      { leaseId: (lease as any).leaseId },
    );
    const createTask = async (
      op: string,
      body: string,
      inputs: any[] = [],
      expected = ['逐字回传任务口令'],
    ) =>
      (await mutate(
        'task.submitFromUser',
        {
          request: {
            kind: 'task.request',
            to: { type: 'role', id: roleId },
            summary: 'P4 口令任务',
            body,
            inputs,
            expected,
            completion: { mode: 'result', to: { type: 'user' } },
          },
        },
        { project_id: project.id, space_id: spaceId },
        op,
      )) as any;
    await build({
      entryPoints: ['apps/participant-mcp/main.mjs'],
      outfile: resolve(dir, 'participant.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
    });
    const client = new Client({ name: 'wl_participant', version: '1.0.0' });
    const entryErr: string[] = [];
    const stdioTransport = new StdioClientTransport({
      command: process.execPath,
      args: [
        resolve(dir, 'participant.mjs'),
        resolve(dir, 'core'),
        roleId as string,
        '--grant',
        grant.grant_id as string,
        '--grant-token',
        (grant as any).token,
      ],
      env: {
        SystemRoot: process.env.SystemRoot as string,
        WINDIR: process.env.WINDIR as string,
        PATH: '',
        TEMP: dir as string,
        TMP: dir as string,
        AGENTROUTER_MANAGED_ROLE: '1',
      },
      stderr: 'pipe',
    });
    (stdioTransport as unknown as { onstderr?: (c: Buffer) => void }).onstderr = (d) =>
      entryErr.push(d.toString());
    await client.connect(stdioTransport);
    const call = async (name: string, args: any = {}): Promise<any> => {
      const r = await client.callTool({ name, arguments: args });
      const value = JSON.parse((r.content as { text: string }[])[0].text);
      if (r.isError) throw new Error(value.error);
      return value;
    };
    try {
      // ── 缺口1:结构化收件箱 —— 任务 body(nonce)与 expected/completion 经工具真实可读 ──
      const inputArtifact = await call('participant_register_artifact', {
        params: {
          name: 'wl-input.md',
          content: '输入附件:按任务正文执行。',
          request_key: 'wl-in-1',
        },
      });
      const t1 = await createTask(
        'wl_task1',
        '演练任务:从本正文读取口令并逐字回传。nonce=WEBDEMO-WL1。',
      );
      let inbox = await call('participant_read_inbox');
      const e1 = inbox.tasks.find((t: any) => t.id === t1.id);
      expect(e1).toBeTruthy();
      expect(e1.body).toContain('WEBDEMO-WL1'); // nonce 必须来自任务正文,而不是聊天提示
      expect(e1.state).toBe('QUEUED');
      expect(e1.expected).toEqual(['逐字回传任务口令']);
      expect(e1.completion).toEqual({ mode: 'result', to: { type: 'user' } });
      expect(e1.acceptance).toBe('PENDING');
      // 带输入附件引用的任务 → inbox 返回可辨识输入(name/sha/bytes),read_artifact 可读取
      const t2 = await createTask(
        'wl_task2',
        '先读输入附件再执行。nonce=WEBDEMO-WL2。',
        [{ kind: 'artifact', artifact_id: inputArtifact.artifact_id }],
        ['引用输入附件内容'],
      );
      inbox = await call('participant_read_inbox');
      const e2 = inbox.tasks.find((t: any) => t.id === t2.id);
      expect(e2.inputs[0]).toMatchObject({
        kind: 'artifact',
        artifact_id: inputArtifact.artifact_id,
        sha256: inputArtifact.sha256,
        state: 'AVAILABLE',
      });
      const readBack = await call('participant_read_artifact', {
        params: { task_id: t2.id, artifact_id: inputArtifact.artifact_id },
      });
      expect(readBack.sha256).toBe(inputArtifact.sha256);

      // ── 缺口2:claim→产物→结果提交,人类验收独立 ──
      await expect(
        call('participant_submit_result', {
          params: {
            task_id: t1.id,
            outcome: 'succeeded',
            summary: 's',
            body: 'b',
            request_key: 'wl-sr-early',
          },
        }),
      ).rejects.toThrow('PLAN_STATE_CONFLICT');
      const claimed = await call('participant_claim_task', {
        params: { task_id: t1.id, request_key: 'wl-ck-1' },
      });
      expect(claimed).toMatchObject({ task_id: t1.id, state: 'ACTIVE' });
      const claimedReplay = await call('participant_claim_task', {
        params: { task_id: t1.id, request_key: 'wl-ck-1' },
      });
      expect(claimedReplay).toMatchObject({ task_id: t1.id, replayed: true });
      // 同键异参数 → 冲突(账本先于任务校验;失败回滚不烧键)
      await expect(
        call('participant_claim_task', { params: { task_id: t2.id, request_key: 'wl-ck-1' } }),
      ).rejects.toThrow('PARTICIPANT_REQUEST_CONFLICT');
      // 交叉引用:引用挂在他任务上的产物作输出 → 拒绝
      const cross = await call('participant_register_artifact', {
        params: {
          name: 'wl-cross.md',
          content: '挂在t2上',
          request_key: 'wl-xk-1',
          task_id: t2.id,
        },
      });
      await expect(
        call('participant_submit_result', {
          params: {
            task_id: t1.id,
            outcome: 'succeeded',
            summary: '错引用',
            body: 'b',
            outputs: [{ kind: 'artifact', artifact_id: cross.artifact_id }],
            request_key: 'wl-sr-badref',
          },
        }),
      ).rejects.toThrow('TASK_SCOPE_DENIED');
      // 产物登记 ≠ 完成:登记后任务仍 ACTIVE,无结果
      const answer = await call('participant_register_artifact', {
        params: {
          name: 'wl-answer.md',
          content: 'nonce=WEBDEMO-WL1 逐字回传。',
          request_key: 'wl-ak-1',
          task_id: t1.id,
        },
      });
      inbox = await call('participant_read_inbox');
      const afterArtifact = inbox.tasks.find((t: any) => t.id === t1.id);
      expect(afterArtifact.state).toBe('ACTIVE');
      expect(afterArtifact.result).toBeUndefined();
      const submitted = await call('participant_submit_result', {
        params: {
          task_id: t1.id,
          outcome: 'succeeded',
          summary: '口令已核对',
          body: 'nonce=WEBDEMO-WL1',
          outputs: [{ kind: 'artifact', artifact_id: answer.artifact_id }],
          request_key: 'wl-sr-1',
        },
      });
      expect(submitted).toMatchObject({
        task_id: t1.id,
        outcome: 'succeeded',
        state: 'DELIVERED',
        publication_state: 'PUBLISHED',
        acceptance: 'PENDING',
      });
      expect(submitted.result_id).toMatch(/^result_/);
      expect(submitted.downstream).toEqual({ type: 'user' });
      const submittedReplay = await call('participant_submit_result', {
        params: {
          task_id: t1.id,
          outcome: 'succeeded',
          summary: '口令已核对',
          body: 'nonce=WEBDEMO-WL1',
          outputs: [{ kind: 'artifact', artifact_id: answer.artifact_id }],
          request_key: 'wl-sr-1',
        },
      });
      expect(submittedReplay).toMatchObject({ result_id: submitted.result_id, replayed: true });
      // 同键异内容 → 冲突
      await expect(
        call('participant_submit_result', {
          params: {
            task_id: t1.id,
            outcome: 'failed',
            summary: '改口供',
            body: 'b2',
            request_key: 'wl-sr-1',
          },
        }),
      ).rejects.toThrow('PARTICIPANT_REQUEST_CONFLICT');
      // 下游账目:结果无 Run、task.result 已投递、任务 DELIVERED、验收仍 PENDING(AI 提交不冒充人类批准)
      {
        const db = new Database(resolve(dir, 'core/router.db'), { readonly: true });
        const res = db
          .prepare('select run_id,publication_state,outcome from results where id=?')
          .get(submitted.result_id) as any;
        expect(res).toMatchObject({
          run_id: null,
          publication_state: 'PUBLISHED',
          outcome: 'succeeded',
        });
        const msg = db
          .prepare(
            "select to_kind,payload_json from messages where task_id=? and kind='task.result'",
          )
          .get(t1.id) as any;
        expect(msg.to_kind).toBe('user');
        expect(JSON.parse(msg.payload_json).result_id).toBe(submitted.result_id);
        expect(
          (
            db
              .prepare(
                "select o.state from outbox o join messages m on m.id=o.message_id where m.task_id=? and m.kind='task.result'",
              )
              .get(t1.id) as any
          ).state,
        ).toBe('DELIVERED');
        expect(
          db.prepare('select state,acceptance from tasks where id=?').get(t1.id) as any,
        ).toMatchObject({
          state: 'DELIVERED',
          acceptance: 'PENDING',
        });
        db.close();
      }
      // 人类验收门仍有效且独立
      await mutate(
        'result.accept',
        { id: submitted.result_id },
        { project_id: project.id, space_id: spaceId },
        'wl_accept',
      );
      {
        const db = new Database(resolve(dir, 'core/router.db'), { readonly: true });
        expect(
          (db.prepare('select acceptance from tasks where id=?').get(t1.id) as any).acceptance,
        ).toBe('ACCEPTED');
        db.close();
      }

      // ── 缺口3:真实 WAITING_INPUT 往返 ──
      await call('participant_claim_task', { params: { task_id: t2.id, request_key: 'wl-ck-2' } });
      const waiting = await call('participant_request_user_input', {
        params: { task_id: t2.id, reason: '需要用户确认继续选项A或B', request_key: 'wl-ru-1' },
      });
      expect(waiting).toMatchObject({
        task_id: t2.id,
        state: 'WAITING_INPUT',
        waiting_for: 'user_input',
      });
      const waitingReplay = await call('participant_request_user_input', {
        params: { task_id: t2.id, reason: '需要用户确认继续选项A或B', request_key: 'wl-ru-1' },
      });
      expect(waitingReplay.replayed).toBe(true);
      // 输入未就绪:不能提交,也不能"继续"认领
      await expect(
        call('participant_submit_result', {
          params: {
            task_id: t2.id,
            outcome: 'succeeded',
            summary: '抢跑',
            body: 'b',
            request_key: 'wl-sr-skip',
          },
        }),
      ).rejects.toThrow('PLAN_STATE_CONFLICT');
      await expect(
        call('participant_claim_task', {
          params: { task_id: t2.id, request_key: 'wl-ck-2-premature' },
        }),
      ).rejects.toThrow('PLAN_STATE_CONFLICT');
      inbox = await call('participant_read_inbox');
      expect(inbox.tasks.find((t: any) => t.id === t2.id)).toMatchObject({
        state: 'WAITING_INPUT',
        waiting_for: 'user_input',
        user_input_ready: false,
      });
      // 用户经 participant_send_user_input 提供输入(正向路径)
      const inputReceipt = await call('participant_send_user_input', {
        params: { task_id: t2.id, body: '确认选项A,继续执行', request_key: 'wl-si-1' },
      });
      expect(inputReceipt.entityId).toBe(t2.id);
      await expect(
        call('participant_send_user_input', {
          params: { task_id: t2.id, body: '改成选项B', request_key: 'wl-si-1' },
        }),
      ).rejects.toThrow('OPERATION_CONFLICT');
      const inputReplay = await call('participant_send_user_input', {
        params: { task_id: t2.id, body: '确认选项A,继续执行', request_key: 'wl-si-1' },
      });
      expect(inputReplay.entityId).toBe(t2.id);
      {
        const db = new Database(resolve(dir, 'core/router.db'), { readonly: true });
        const storedInput = db
          .prepare(
            'select operation_id,consumed_at_ms from task_inputs where task_id=?',
          )
          .get(t2.id) as { operation_id: string; consumed_at_ms: number | null };
        expect(storedInput.operation_id).toMatch(/^mcp_p_[a-f0-9]{64}$/);
        expect(storedInput.consumed_at_ms).toBeNull();
        db.close();
      }
      // 就绪后继续推进:claim(WAITING_INPUT→ACTIVE)→ 提交包含用户决策的结果
      inbox = await call('participant_read_inbox');
      expect(inbox.tasks.find((t: any) => t.id === t2.id).user_input_ready).toBe(true);
      const resumed = await call('participant_claim_task', {
        params: { task_id: t2.id, request_key: 'wl-ck-2b' },
      });
      expect(resumed).toMatchObject({ task_id: t2.id, state: 'ACTIVE' });
      expect(resumed.task_input).toMatchObject({
        body: '确认选项A,继续执行',
      });
      expect(resumed.task_input.input_id).toMatch(/^task_input_/);
      const submitted2 = await call('participant_submit_result', {
        params: {
          task_id: t2.id,
          outcome: 'succeeded',
          summary: '按用户选项A完成',
          body: 'nonce=WEBDEMO-WL2;用户输入=确认选项A,继续执行',
          request_key: 'wl-sr-2',
        },
      });
      expect(submitted2).toMatchObject({ state: 'DELIVERED', publication_state: 'PUBLISHED' });
      {
        const db = new Database(resolve(dir, 'core/router.db'), { readonly: true });
        expect(
          (db.prepare('select ready from wait_records where task_id=?').get(t2.id) as any).ready,
        ).toBe(0);
        expect((db.prepare('select state from tasks where id=?').get(t2.id) as any).state).toBe(
          'DELIVERED',
        );
        expect(
          (db.prepare('select active_task_id from role_slots where role_id=?').get(roleId) as any)
            .active_task_id,
        ).toBeNull();
        expect(
          db
            .prepare(
              'select consumed_by_participant_request_key from task_inputs where task_id=?',
            )
            .get(t2.id),
        ).toEqual({ consumed_by_participant_request_key: 'wl-ck-2b' });
        db.close();
      }
      // 收件箱终态可见:两任务 DELIVERED,结果发布态与验收位齐全
      inbox = await call('participant_read_inbox');
      const fin1 = inbox.tasks.find((t: any) => t.id === t1.id);
      expect(fin1).toMatchObject({ state: 'DELIVERED', acceptance: 'ACCEPTED' });
      expect(fin1.result).toMatchObject({
        id: submitted.result_id,
        outcome: 'succeeded',
        publication_state: 'PUBLISHED',
      });
    } catch (e) {
      console.log('CORE STDERR:', coreErr.join('').slice(-2000));
      console.log('ENTRY STDERR:', entryErr.join('').slice(-2000));
      throw e;
    } finally {
      await client.close().catch(() => {});
      await setup.close().catch(() => {});
      core.kill();
      await new Promise((r) => setTimeout(r, 500));
    }
  },
);
