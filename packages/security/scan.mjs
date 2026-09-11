// 检测结果只含规则编号，绝不返回命中的正文。
const rules = [
  [
    'PROVIDER_KEY',
    /(?<![A-Za-z0-9_])(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/,
  ],
  ['BEARER', /Bearer\s+[A-Za-z0-9_.~+\/-]{20,}={0,2}/i],
  ['JWT', /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  [
    'CREDENTIAL_FIELD',
    /(?<![A-Za-z0-9_])["']?(?:access_token|refresh_token|api_key|apiKey|OPENAI_API_KEY|KIMI_API_KEY|COOKIE|SET-COOKIE)["']?\s*[:=]\s*["']?(?!\s*["']?\s*(?:null|undefined|\$|\{|REDACTED|os-secret:\/\/))[A-Za-z0-9_.~+\/-]{12,}/i,
  ],
  ['CANARY', /AR_CANARY_[A-Z0-9]{16,}/],
];
export function scanText(text) {
  return rules.filter(([, re]) => re.test(text)).map(([id]) => id);
}
export function forbiddenPath(path) {
  if (/(?:^|[\\/])账号信息(?:[\\/]|$)/u.test(path)) return true;
  return /(?:^|\/)(?:auth\.json|\.env(?:\..*)?|[^/]*(?:token|secret)[^/]*|[^/]*\.log)$|(?:^|\/)evidence\/(?:raw|live-raw)\//i.test(
    path,
  );
}
