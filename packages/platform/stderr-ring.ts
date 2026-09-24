import { createHash } from 'node:crypto';

/** W04 受控诊断:子进程 stderr 的有界 line-buffer 环。
 * - 按"完整行"缓冲后才脱敏入环 → 跨 chunk 被切开的长 key 不会半截泄漏;
 * - 冲刷时对残余半行做保守整行 REDACTED;
 * - 实际凭据串(用户真实 key,非 sk- 形态)由调用方注入 secrets 集合精确匹配;
 * - 仅内存环,持久化(audit)时也已脱敏;正常运行不外发。 */
export class StderrRing {
  private pending = '';
  private lines: string[] = [];
  private bytes = 0;
  constructor(private readonly secrets: readonly string[] = [], private readonly maxBytes = 8192) {}
  push(chunk: Buffer | string) {
    this.pending += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let idx: number;
    while ((idx = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, idx);
      this.pending = this.pending.slice(idx + 1);
      this.admit(line);
    }
    // 防无换行超长:半行超上限时保守丢弃(不脱敏半行,避免跨 chunk 泄漏)
    if (this.pending.length > this.maxBytes) this.pending = '';
  }
  /** 子进程退出后的最终冲刷:残余半行不脱敏无安全保证 → 整行丢弃,只冲已入环内容。 */
  tail(): string {
    return this.sanitize(this.lines.join('\n')).slice(-this.maxBytes);
  }
  private admit(line: string) {
    const safe = this.sanitize(line);
    this.lines.push(safe);
    this.bytes += Buffer.byteLength(safe) + 1;
    while (this.bytes > this.maxBytes && this.lines.length > 1)
      this.bytes -= Buffer.byteLength(this.lines.shift()!) + 1;
  }
  private sanitize(text: string): string {
    let out = text;
    for (const secret of this.secrets) {
      const s = String(secret);
      if (s.length >= 8) out = out.split(s).join('[REDACTED]');
    }
    out = out.replace(/Bearer\s+[A-Za-z0-9_.~+/=-]{8,}/gi, 'Bearer [REDACTED]');
    out = out.replace(/(authorization|api[_-]?key|set-cookie|cookie)(\s*[:=]\s*)\S+/gi, '$1$2[REDACTED]');
    out = out.replace(/sk-[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
    return out;
  }
}

/** W04 结构化错误层次:phase 全集;错误报告只含 code/phase/脱敏尾。 */
export const DIAGNOSTIC_PHASES = ['HOST', 'PREPARE', 'SPAWN', 'ACP', 'SESSION', 'MCP', 'BOOTSTRAP', 'PROMPT', 'FINISH', 'STOP'] as const;
export type DiagnosticPhase = (typeof DIAGNOSTIC_PHASES)[number];

export interface ControlledDiagnostic {
  phase: DiagnosticPhase;
  code: string;
  detailTail?: string;
}

export function diagnosticFingerprint(diag: ControlledDiagnostic): string {
  return createHash('sha256').update(diag.phase + '|' + diag.code + '|' + (diag.detailTail ?? '')).digest('hex').slice(0, 16);
}
