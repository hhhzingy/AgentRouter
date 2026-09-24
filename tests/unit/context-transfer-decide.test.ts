import { describe, expect, it } from 'vitest';
import { decideTransfer, inheritSupported } from '../../packages/core-service/context-transfer.ts';

describe('WC01/SH-02 容量决策顺序', () => {
  it('T≥S 且 A=null 仍 DIRECT(无须占用值)', () => {
    expect(decideTransfer({ targetWindowTokens: 1000, sourceWindowTokens: 800, sourceUsageTokens: null })).toEqual({
      action: 'DIRECT',
      reason: 'TARGET_AT_LEAST_SOURCE',
    });
    expect(decideTransfer({ targetWindowTokens: 800, sourceWindowTokens: 800, sourceUsageTokens: null })).toEqual({
      action: 'DIRECT',
      reason: 'TARGET_AT_LEAST_SOURCE',
    });
  });
  it('T<S 且 A 未知 → ASK_USER(不当 0)', () => {
    expect(decideTransfer({ targetWindowTokens: 500, sourceWindowTokens: 800, sourceUsageTokens: null })).toEqual({
      action: 'ASK_USER',
      reason: 'CAPACITY_UNKNOWN',
    });
  });
  it('T<S: A≤T DIRECT;A>T COMPRESS', () => {
    expect(decideTransfer({ targetWindowTokens: 500, sourceWindowTokens: 800, sourceUsageTokens: 400 })).toEqual({
      action: 'DIRECT',
      reason: 'USAGE_FITS_TARGET',
    });
    expect(decideTransfer({ targetWindowTokens: 500, sourceWindowTokens: 800, sourceUsageTokens: 900 })).toEqual({
      action: 'COMPRESS',
      reason: 'USAGE_OVER_TARGET',
    });
  });
  it('T/S 未知 → ASK_USER', () => {
    expect(decideTransfer({ targetWindowTokens: null, sourceWindowTokens: 800, sourceUsageTokens: 1 })).toEqual({
      action: 'ASK_USER',
      reason: 'CAPACITY_UNKNOWN',
    });
    expect(decideTransfer({ targetWindowTokens: 1000, sourceWindowTokens: null, sourceUsageTokens: 1 })).toEqual({
      action: 'ASK_USER',
      reason: 'CAPACITY_UNKNOWN',
    });
  });
});

describe('WC01/SH-01 继承门控(按来源能力+双端真实通道)', () => {
  it('FULL_VISIBLE + 双通道 → 允许', () => {
    expect(inheritSupported({ sourceHistoryExport: 'FULL_VISIBLE', sourceExportChannel: true, targetInitChannel: true })).toBe(true);
  });
  it('任一通道未接线 → 拒绝(不再有硬编码 false 之外的静默)', () => {
    expect(inheritSupported({ sourceHistoryExport: 'FULL_VISIBLE', sourceExportChannel: false, targetInitChannel: true })).toBe(false);
    expect(inheritSupported({ sourceHistoryExport: 'FULL_VISIBLE', sourceExportChannel: true, targetInitChannel: false })).toBe(false);
  });
  it('非 FULL_VISIBLE(含 PARTIAL/UNKNOWN/UNSUPPORTED) → 拒绝', () => {
    for (const cap of ['PARTIAL', 'ROUTER_ONLY', 'UNSUPPORTED', 'UNKNOWN'])
      expect(inheritSupported({ sourceHistoryExport: cap, sourceExportChannel: true, targetInitChannel: true })).toBe(false);
  });
});
