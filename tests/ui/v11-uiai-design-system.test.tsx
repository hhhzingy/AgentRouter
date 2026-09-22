import { readFileSync } from 'node:fs';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { GlobalSettingsPage } from '../../apps/desktop/workbench/pages-settings.tsx';
import { Shell } from '../../apps/desktop/workbench/shell.tsx';
import { makeStore, render } from './helpers.tsx';

describe('V1.1 UIAI Design System 与信息架构', () => {
  it('全局 Shell 只提供 Projects / Connections / Settings 三个一级入口', () => {
    const html = render(makeStore({}), <Shell><div /></Shell>);
    expect(html).toContain('aria-label="全局导航"');
    for (const label of ['Projects', 'Connections', 'Settings']) expect(html).toContain(`>${label}<`);
    expect(html).toContain('跳到主要内容');
  });

  it('Design System 提供语义 token、深色主题、focus 与 reduced motion', () => {
    const css = readFileSync('apps/desktop/workbench.css', 'utf8');
    for (const token of ['--focus-ring', '--motion-normal', '--sidebar-width', "[data-theme='dark']"])
      expect(css).toContain(token);
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('全局设置只呈现真实本机主题与 Core 身份，不伪造 Core 开关', () => {
    const html = render(makeStore({}), <GlobalSettingsPage />);
    expect(html).toContain('跟随系统');
    expect(html).toContain('Core 身份');
    expect(html).toContain('主题保存在本机');
    expect(html).not.toContain('Force Takeover');
  });

  it('Mobile 使用 Home / Activity / Results / More，并以真实合同复核 Result', () => {
    const source = readFileSync('packages/remote/console.html', 'utf8');
    for (const label of ['Home', 'Activity', 'Results', 'More']) expect(source).toContain(`>${label}<`);
    expect(source).toContain("send('result.accept'");
    expect(source).toContain("send('result.reject'");
    expect(source).toContain('Published 与 Accepted 是不同事实');
  });
});
