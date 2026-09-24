// 结构化白名单：从不保留原始消息、请求、stdout/stderr 或异常 message。
import { createHash } from 'node:crypto';
export function diagnosticSummary(input) {
  const out = { redacted: true, marker: 'REDACTED' };
  for (const key of [
    'exit_code',
    'event_count',
    'test_count',
    'passed_count',
    'failed_count',
    'duration_ms',
  ])
    if (Number.isSafeInteger(input[key]) && input[key] >= 0) out[key] = input[key];
  if (input.exit_code === null) out.exit_code = null;
  if (['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED_ENV'].includes(input.status)) out.status = input.status;
  for (const key of ['code', 'test'])
    if (typeof input[key] === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(input[key]))
      out[key] = input[key];
  if (typeof input.version === 'string' && /^v?\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(input.version))
    out.version = input.version;
  if (typeof input.at === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(input.at))
    out.at = input.at;
  return out;
}
export function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function redactLocation(value) {
  return typeof value === 'string'
    ? value
        .replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/gi, '%USERPROFILE%')
        .replace(/\/(?:home|Users)\/[^/\s"']+/g, '$HOME')
    : value;
}
