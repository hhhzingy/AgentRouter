import { it, expect } from 'vitest';
import { parseLabeledCredential } from '../../packages/security/labeled-credential.ts';

const sample = ['base_url (OpenAI)', 'https://ws-demo.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', 'api_key', 'unitkey-fixture-not-a-real-secret-1', 'model', 'qwen3.8-flash'].join('\n');

it('解析标签格式:base_url/api_key/model,尾斜杠归一', () => {
  const c = parseLabeledCredential(sample);
  expect(c.baseUrl).toBe('https://ws-demo.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
  expect(c.apiKey).toBe('unitkey-fixture-not-a-real-secret-1');
  expect(c.model).toBe('qwen3.8-flash');
});

it('拒绝:无 URL/无 key/含空白 key/超长度', () => {
  expect(() => parseLabeledCredential('api_key\nshortkey-no-url')).toThrow('CRED_URL_MISSING');
  expect(() => parseLabeledCredential('base_url\nhttps://a.b/v1\napi_key')).toThrow('CRED_KEY_UNREADABLE');
  expect(() => parseLabeledCredential('base_url\nhttps://a.b/v1\napi_key\nhas whitespace key')).toThrow('CRED_KEY_UNREADABLE');
});

it('model 缺失或非单行时可选省略', () => {
  const c = parseLabeledCredential('base_url (OpenAI)\nhttps://a.b/v1\napi_key\nvalid-key-value-123456');
  expect(c.model).toBeUndefined();
  expect(c.apiKey).toBe('valid-key-value-123456');
});
