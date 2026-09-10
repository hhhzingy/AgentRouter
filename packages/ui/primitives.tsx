/**
 * UI Baseline V1 基础组件。纯受控、无业务状态机：
 * 所有数据经 props 传入，所有动作经回调传出，状态解释只来自 status.ts。
 */
import React, { type ReactNode } from 'react';
import type { DisplayState, DisplayTone } from './status.ts';

export function ToneBadge({ state, title }: { state: DisplayState; title?: string }) {
  return (
    <span className={`badge tone-${state.tone}`} data-state-key={state.key} title={title}>
      {state.label}
    </span>
  );
}

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: DisplayTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`badge tone-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function StatusDot({ tone, label }: { tone: DisplayTone; label: string }) {
  return <span className={`status-dot tone-${tone}`} role="img" aria-label={label} title={label} />;
}

export function Avatar({ name, tone = 'neutral' }: { name: string; tone?: DisplayTone }) {
  return (
    <span className={`avatar tone-${tone}`} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section';
}) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function Button({
  variant = 'secondary',
  disabled,
  onClick,
  children,
  type = 'button',
  title,
  ariaLabel,
}: {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  type?: 'button' | 'submit';
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className="kv-v">{v}</span>
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: string; label: string; badge?: number }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={`tab ${active === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.badge !== undefined && t.badge > 0 && (
            <span className="tab-badge" aria-label={`${t.badge} 条`}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function useModal<T extends HTMLElement>(onClose: () => void) {
  const ref = React.useRef<T | null>(null),
    close = React.useRef(onClose);
  close.current = onClose;
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const items = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
        ) ?? [],
      ).filter((x) => x.getClientRects().length && !x.closest('fieldset[disabled]'));
    const inertNodes:Array<{node:HTMLElement;previous:boolean}>=[];
    let branch:HTMLElement|null=ref.current?.closest<HTMLElement>('.overlay')??null;
    while(branch&&branch!==document.body){for(const child of Array.from(branch.parentElement?.children??[])){if(child!==branch&&child instanceof HTMLElement){inertNodes.push({node:child,previous:child.inert});child.inert=true;}}branch=branch.parentElement;}
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    items()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      }
      if (e.key === 'Tab') {
        const nodes = items(),
          first = nodes[0],
          last = nodes.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      for(const item of inertNodes)item.node.inert=item.previous;document.body.style.overflow=overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return ref;
}

export function Dialog({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const ref = useModal<HTMLDivElement>(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-head">
          <h2>{title}</h2>
          <Button variant="ghost" onClick={onClose} ariaLabel="关闭">
            ✕
          </Button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const ref = useModal<HTMLElement>(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <aside
        ref={ref}
        className="drawer"
        role="complementary"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-head">
          <h2>{title}</h2>
          <Button variant="ghost" onClick={onClose} ariaLabel="关闭">
            ✕
          </Button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </aside>
    </div>
  );
}

/** 能力门控：能力缺失时禁用并说明，不隐藏真实功能入口。 */
export function CapabilityGate({
  available,
  unavailableReason,
  children,
}: {
  available: boolean;
  unavailableReason: string;
  children: ReactNode;
}) {
  if (available) return <>{children}</>;
  return (
    <span className="capability-blocked" title={unavailableReason}>
      <fieldset
        disabled
        className="capability-blocked-inner"
        aria-disabled="true"
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        {children}
      </fieldset>
      <span className="capability-reason">{unavailableReason}</span>
    </span>
  );
}
