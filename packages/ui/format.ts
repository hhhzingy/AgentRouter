/** 时间/数量格式化。所有"相对时间"都必须由调用方注入 now，保证可测试、可冻结。 */

export function formatClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 相对时间：仅用于"多久前"，精确时间以 title 悬浮完整展示。 */
export function formatAgo(ms: number, now: number): string {
  const diff = now - ms;
  if (diff < 0) return formatDateTime(ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

/** "数据截至"用于断线冻结展示，只用精确时刻，不用相对时间。 */
export function formatAsOf(ms: number): string {
  return `数据截至 ${formatDateTime(ms)}`;
}

export function formatCount(n: number, label: string): string {
  return `${n} ${label}`;
}

/** 队列位置：只展示 Core 返回的精确位置；没有则不展示，绝不估算。 */
export function formatQueuePosition(queuePosition?: number): string | null {
  if (queuePosition === undefined || queuePosition === null) return null;
  return `队列位置 ${queuePosition}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
