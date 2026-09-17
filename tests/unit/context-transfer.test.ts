import { it, expect, describe } from 'vitest';
import { decideTransfer, inheritSupported } from '../../packages/core-service/context-transfer.ts';

describe('W03 容量决策纯函数(附件§6 规则)', () => {
  it('WC01/SH-02: T>=S 且 A=null 直接迁移(无须查 A)', () => {
    expect(decideTransfer({ targetWindowTokens: 200000, sourceWindowTokens: 128000, sourceUsageTokens: null }))
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
  it('WC01/SH-01: inherit 按来源能力+双端真实通道门控(旧双参硬编码签名已废除)', () => {
    expect(inheritSupported({ sourceHistoryExport: 'FULL_VISIBLE', sourceExportChannel: true, targetInitChannel: true })).toBe(true);
    expect(inheritSupported({ sourceHistoryExport: 'FULL_VISIBLE', sourceExportChannel: false, targetInitChannel: true })).toBe(false);
    expect(inheritSupported({ sourceHistoryExport: 'UNKNOWN', sourceExportChannel: true, targetInitChannel: true })).toBe(false);
    expect(inheritSupported({ sourceHistoryExport: 'UNSUPPORTED', sourceExportChannel: true, targetInitChannel: true })).toBe(false);
  });
});
