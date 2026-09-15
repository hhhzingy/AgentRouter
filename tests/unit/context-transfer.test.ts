import { it, expect, describe } from 'vitest';
import { decideTransfer, inheritSupported } from '../../packages/core-service/context-transfer.ts';

describe('W03 容量决策纯函数(附件§6 规则)', () => {
  it('T>=S 直接迁移,不查 A', () => {
    expect(decideTransfer({ targetWindowTokens: 200000, sourceWindowTokens: 128000, sourceUsageTokens: 127000 }))
      .toEqual({ action: 'DIRECT', reason: 'TARGET_AT_LEAST_SOURCE' });
  });
  it('T<S 且 A<=T 直接', () => {
    expect(decideTransfer({ targetWindowTokens: 128000, sourceWindowTokens: 200000, sourceUsageTokens: 90000 }))
      .toEqual({ action: 'DIRECT', reason: 'USAGE_FITS_TARGET' });
  });
  it('T<S 且 A>T 压缩', () => {
    expect(decideTransfer({ targetWindowTokens: 128000, sourceWindowTokens: 200000, sourceUsageTokens: 190000 }))
      .toEqual({ action: 'COMPRESS', reason: 'USAGE_OVER_TARGET' });
  });
  it('T/S/A 未知不当 0 → ASK_USER(CAPACITY_UNKNOWN)', () => {
    expect(decideTransfer({ targetWindowTokens: null, sourceWindowTokens: 128000, sourceUsageTokens: null }))
      .toEqual({ action: 'ASK_USER', reason: 'CAPACITY_UNKNOWN' });
    expect(decideTransfer({ targetWindowTokens: 128000, sourceWindowTokens: null, sourceUsageTokens: null }))
      .toEqual({ action: 'ASK_USER', reason: 'CAPACITY_UNKNOWN' });
  });
  it('inherit 仅在 FULL_VISIBLE + 有受信通道时支持', () => {
    expect(inheritSupported('FULL_VISIBLE', true)).toBe(true);
    expect(inheritSupported('FULL_VISIBLE', false)).toBe(false);
    expect(inheritSupported('UNKNOWN', true)).toBe(false);
    expect(inheritSupported('UNSUPPORTED', true)).toBe(false);
  });
});
