import type { IncomingHttpHeaders } from 'node:http';

// 私网反向代理的外部 origin 必须显式配置；不信任 Forwarded/X-Forwarded-*。
export function privateServeOrigin(value?: string): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.ts.net') ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      value !== url.origin) throw Error('INVALID_PRIVATE_SERVE_ORIGIN');
  return url.origin;
}

export function allowReadRequest(headers: IncomingHttpHeaders, port: number, serveOrigin?: string): boolean {
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  if (serveOrigin) origins.push(serveOrigin);
  const hosts = origins.map(origin => new URL(origin).host);
  if (typeof headers.host !== 'string' || !hosts.includes(headers.host)) return false;
  if (headers.origin !== undefined && (typeof headers.origin !== 'string' || !origins.includes(headers.origin))) return false;
  // 阻止跨站网页通过导航以外的请求读取本机观察者接口。
  if (headers['sec-fetch-site'] === 'cross-site') return false;
  return true;
}
