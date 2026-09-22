import React from 'react';
import { Badge, Card, KeyValue, SegmentedControl } from '../../../packages/ui/index.ts';
import { useStore } from './store.tsx';

type ThemePreference = 'system' | 'light' | 'dark';

function savedTheme(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const value = localStorage.getItem('agentrouter.theme');
  return value === 'light' || value === 'dark' ? value : 'system';
}

function applyTheme(value: ThemePreference) {
  if (typeof document === 'undefined') return;
  const resolved =
    value === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : value;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function GlobalSettingsPage() {
  const s = useStore();
  const [theme, setTheme] = React.useState<ThemePreference>(savedTheme);

  React.useEffect(() => {
    applyTheme(theme);
    if (typeof localStorage !== 'undefined') {
      if (theme === 'system') localStorage.removeItem('agentrouter.theme');
      else localStorage.setItem('agentrouter.theme', theme);
    }
  }, [theme]);

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">APP SETTINGS</span>
          <h1>设置</h1>
          <p>这里只包含当前客户端可真实控制的选项；项目设置仍在各项目内。</p>
        </div>
      </header>
      <div className="settings-grid global-settings-grid">
        <Card as="section">
          <h2>外观</h2>
          <p className="muted">主题保存在本机，不会写入 Core 或同步到其他设备。</p>
          <SegmentedControl
            label="界面主题"
            value={theme}
            options={[
              { value: 'system', label: '跟随系统' },
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
            ]}
            onChange={(value) => setTheme(value as ThemePreference)}
          />
        </Card>
        <Card as="section">
          <h2>Core 身份</h2>
          <KeyValue k="模式" v={s.contextMode === 'REMOTE_CORE' ? 'Remote' : 'Local'} />
          <KeyValue k="实例" v={<code>{s.hello.serverInstanceId}</code>} />
          <KeyValue k="合同" v={s.hello.contractRevision ?? s.hello.protocol} />
          <KeyValue
            k="连接"
            v={
              <Badge tone={s.connectionState === 'CONNECTED_CONTROLLER' ? 'ok' : 'queue'}>
                {s.connectionState}
              </Badge>
            }
          />
        </Card>
        <Card as="section">
          <h2>诊断边界</h2>
          <p>诊断信息必须脱敏；Remote token、账号凭据与 renderer 外部路径不会显示在这里。</p>
          <p className="muted">关闭窗口只退出当前界面，不等同于停止独立运行的 Local Core。</p>
        </Card>
        <Card as="section">
          <h2>项目设置</h2>
          <p>角色与权限、Harness 与模型、工作区和项目连接按项目隔离。</p>
          <a className="btn btn-secondary" href="#/">返回 Projects 选择项目</a>
        </Card>
      </div>
    </div>
  );
}
