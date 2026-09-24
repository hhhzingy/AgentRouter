import { expect, it } from 'vitest';
import { slotBindingSummaryLabel } from '../../apps/desktop/workbench/pages-role.tsx';

it('Slot Binding 仅把可信请求时间显示为最近活动，始终不推断在线', () => {
  const base = { display_name: 'ChatGPT 网页 Participant', state: 'ACTIVE' };
  expect(slotBindingSummaryLabel({ ...base, last_seen_at_ms: null }, 'BOUND'))
    .toContain('最近活动未知 · 在线未知');
  const seen = slotBindingSummaryLabel({ ...base, last_seen_at_ms: 1790150000000 }, 'BOUND');
  expect(seen).toContain('最近已认证活动');
  expect(seen).toContain('在线未知');
  expect(seen).not.toContain('最近在线');
  expect(slotBindingSummaryLabel(null, 'BOUND')).toBe('绑定详情未上报');
});
