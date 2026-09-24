import { expect, it } from 'vitest';
import { allowReadRequest, privateServeOrigin } from '../../apps/web-console/access-policy.ts';

it('默认只接收准确本机 Host，拒绝 DNS rebinding 与跨站 Origin', () => {
  expect(allowReadRequest({ host: '127.0.0.1:8787' }, 8787)).toBe(true);
  expect(allowReadRequest({ host: 'localhost:8787', origin: 'http://localhost:8787' }, 8787)).toBe(true);
  for (const headers of [
    {}, { host: 'evil.test:8787' }, { host: '127.0.0.1:8788' },
    { host: '127.0.0.1:8787', origin: 'null' },
    { host: '127.0.0.1:8787', origin: 'https://evil.test' },
    { host: '127.0.0.1:8787', 'sec-fetch-site': 'cross-site' },
    { host: 'evil.test', 'x-forwarded-host': '127.0.0.1:8787' },
  ]) expect(allowReadRequest(headers, 8787)).toBe(false);
});

it('Serve 只允许显式配置的准确 HTTPS origin，不接受后缀冒充或转发头授权', () => {
  const origin = privateServeOrigin('https://lab.example.ts.net');
  expect(allowReadRequest({ host: 'lab.example.ts.net', origin }, 8787, origin)).toBe(true);
  expect(allowReadRequest({ host: 'other.example.ts.net' }, 8787, origin)).toBe(false);
  expect(allowReadRequest({ host: 'lab.example.ts.net' }, 8787)).toBe(false);
  for (const bad of ['http://lab.ts.net', 'https://lab.ts.net.evil.test', 'https://user:pass@lab.ts.net', 'https://lab.ts.net/path', 'https://lab.ts.net?x=1'])
    expect(() => privateServeOrigin(bad)).toThrow();
});
