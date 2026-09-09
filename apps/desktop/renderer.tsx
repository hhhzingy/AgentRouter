import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
declare global {
  interface Window {
    router: {
      createRole: (input: unknown) => Promise<any>;
      setRoleStatus: (id: string, status: string) => Promise<any>;
      renameRole: (id: string, name: string) => Promise<any>;
      snapshot: () => Promise<any>;
      chooseDirectory: () => Promise<string | null>;
      createProject: (name: string, path: string) => Promise<any>;
      archiveProject: (id: string) => Promise<any>;
    };
  }
}
function App() {
  const [view, setView] = useState('项目'),
    [data, setData] = useState<any>(null),
    [error, setError] = useState('');
  const refresh = () =>
    window.router
      .snapshot()
      .then(setData)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);
  async function create() {
    const path = await window.router.chooseDirectory();
    if (!path) return;
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? '新项目';
    try {
      await window.router.createProject(name, path);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <b>AR</b>
          <span>
            AgentRouter<small>本地协作工作台</small>
          </span>
        </div>
        <nav>
          {['项目', '角色与队列', '协作时间线', '用户收件箱', '问题中心', '兼容性'].map((label) => (
            <button
              key={label}
              className={view === label ? 'selected' : ''}
              onClick={() => setView(label)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="foot">
          V1.0 开发预览
          <br />
          真实 Harness 验收尚未完成
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">WORKSPACE / 本地工作空间</div>
            <h1>{view}</h1>
          </div>
          <span className="badge">{data ? 'Core 已连接' : '正在连接'}</span>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {view === '项目' && (
          <>
            <div className="intro">
              <div>
                <h2>让每一次交接都有明确去向</h2>
                <p>项目与协作记录保存在本地。归档保留源文件。</p>
              </div>
              <button className="primary" onClick={create}>
                ＋ 登记项目目录
              </button>
            </div>
            <div className="grid">
              {data?.projects?.map((p: any) => (
                <article key={p.id}>
                  <span className="eyebrow">{p.status === 'ACTIVE' ? '活跃项目' : '已归档'}</span>
                  <h2>{p.name}</h2>
                  <p className="path">{p.root_path}</p>
                  <small>{p.id}</small>
                  {p.status === 'ACTIVE' && (
                    <button
                      className="secondary"
                      onClick={async () => {
                        await window.router.archiveProject(p.id);
                        await refresh();
                      }}
                    >
                      归档
                    </button>
                  )}
                </article>
              ))}
            </div>
            {!data?.projects?.length && (
              <div className="empty">
                <h2>从一个项目目录开始</h2>
                <p>
                  登记现有目录后，项目会保留稳定身份。登记后可创建角色，设置职责与
                  Harness。真实运行须等待兼容性验收。
                </p>
              </div>
            )}
          </>
        )}
        {view === '兼容性' && (
          <>
            <div className="grid">
              {Object.entries(data?.support ?? {}).map(([name, status]) => (
                <article key={name}>
                  <h2>{name}</h2>
                  <p>{String(status)}</p>
                  <span className="warn">未认证支持</span>
                </article>
              ))}
            </div>
            <article>
              <h2>实际 Core 运行时</h2>
              <p>
                Node {data?.runtime?.node} · SQLite {data?.runtime?.sqlite}
              </p>
              <p>完成报告与原生收尾分别保存；模拟测试不计真实 Harness 支持。</p>
            </article>
          </>
        )}
        {view === '角色与队列' && <RolePanel data={data} refresh={refresh} onError={setError} />}
        {view === '协作时间线' && <Rows values={data?.events} />}
        {view === '用户收件箱' && <Rows values={data?.inbox} />}
        {view === '问题中心' && <Rows values={data?.issues} />}
      </main>
    </div>
  );
}
function RolePanel({
  data,
  refresh,
  onError,
}: {
  data: any;
  refresh: () => Promise<any>;
  onError: (text: string) => void;
}) {
  const [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [harness, setHarness] = useState('codex'),
    [spaceId, setSpaceId] = useState('');
  const spaces = (data?.spaces ?? []).filter((s: any) => s.status === 'ACTIVE');
  const space = spaces.find((s: any) => s.id === spaceId) ?? spaces[0];
  const workspace = data?.workspaces?.find(
    (w: any) => w.project_id === space?.project_id && w.kind === 'MAIN',
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await window.router.createRole({
        name,
        description,
        harness,
        spaceId: space.id,
        workspaceId: workspace.id,
      });
      setName('');
      setDescription('');
      await refresh();
    } catch (e) {
      onError(String(e));
    }
  }
  return (
    <>
      <article>
        <h2>创建角色</h2>
        <p>角色身份持久保留。Harness 未认证时可以保存角色配置，但执行入口保持阻断。</p>
        <form className="role-form" onSubmit={submit}>
          <label>
            协作空间
            <select value={space?.id ?? ''} onChange={(e) => setSpaceId(e.target.value)}>
              {spaces.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {data.projects.find((p: any) => p.id === s.project_id)?.name} / {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            展示名
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Harness
            <select value={harness} onChange={(e) => setHarness(e.target.value)}>
              <option value="codex">Codex</option>
              <option value="kimi_code">Kimi Code</option>
              <option value="pi">pi</option>
            </select>
          </label>
          <label>
            职责说明
            <textarea
              maxLength={8192}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button className="primary" disabled={!workspace || !name.trim()} type="submit">
            保存角色
          </button>
          {!workspace && <span>请先登记一个项目目录。</span>}
        </form>
      </article>
      <div className="grid">
        {data?.roles?.map((r: any) => (
          <article key={r.id}>
            <h2>{r.name}</h2>
            <p>{r.description || '尚未填写职责'}</p>
            <p>
              {data.bindings?.find((b: any) => b.role_id === r.id && b.is_current)?.harness} ·{' '}
              {r.status === 'ACTIVE'
                ? '可接收排队任务'
                : r.status === 'PAUSED'
                  ? '已暂停'
                  : r.status}
            </p>
            <small>{r.id}</small>
            <span className="warn">真实运行待认证</span>
            <div>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await window.router.setRoleStatus(
                      r.id,
                      r.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                    );
                    await refresh();
                  } catch (e) {
                    onError(String(e));
                  }
                }}
              >
                {r.status === 'ACTIVE' ? '暂停新派发' : '恢复排队'}
              </button>
            </div>
          </article>
        ))}
      </div>
      <h2>任务队列</h2>
      <Rows values={data?.tasks} />
    </>
  );
}
function Rows({ values }: { values: any[] | undefined }) {
  return !values?.length ? (
    <div className="empty">
      <h2>暂无记录</h2>
      <p>此处只展示 Core 已持久化的真实记录。</p>
    </div>
  ) : (
    <div>
      {values.map((v, i) => (
        <article key={v.id ?? v.seq ?? i}>
          <h3>{v.summary ?? v.name ?? v.event_type ?? v.code}</h3>
          <p>{v.state ?? v.status}</p>
          <pre>{JSON.stringify(v, null, 2)}</pre>
        </article>
      ))}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
