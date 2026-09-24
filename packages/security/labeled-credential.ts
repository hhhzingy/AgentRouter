/** 百炼(标签格式)凭据的安全解析:base_url (OpenAI)/<url>、api_key/<key>、model/<model>。
 * 仅受信宿主使用;绝不把解析结果写入日志/审计/Git。key 校验:单行、无空白、长度 8..512。 */
export interface LabeledCredential {
  baseUrl: string;
  apiKey: string;
  model?: string;
}
export function parseLabeledCredential(text: string): LabeledCredential {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const valueAfter = (label: string) => {
    const i = lines.findIndex(l => l.toLowerCase().startsWith(label.toLowerCase()));
    return i >= 0 && i + 1 < lines.length ? lines[i + 1] : undefined;
  };
  const urlLine = lines.find(l => /^https?:\/\//.test(l));
  if (!urlLine) throw Error('CRED_URL_MISSING');
  let u: URL;
  try { u = new URL(urlLine); } catch { throw Error('CRED_URL_INVALID'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw Error('CRED_URL_INVALID');
  const apiKey = valueAfter('api_key');
  if (typeof apiKey !== 'string' || /\s/.test(apiKey) || apiKey.length < 8 || apiKey.length > 512)
    throw Error('CRED_KEY_UNREADABLE');
  const model = valueAfter('model');
  return {
    baseUrl: u.origin + u.pathname.replace(/\/$/, ''),
    apiKey,
    ...(model && !/\s/.test(model) && model.length <= 128 ? { model } : {}),
  };
}
