import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
import type { ConnectOptions } from '../../packages/client-transport/p1/types.ts';
/** Main 专用：客户端断开不终止独立 Core；不传递凭据或 Fixture 控制给 Renderer。 */
export async function connectLocalCore(data: string, buildDir: string, options: ConnectOptions) {
  mkdirSync(data, { recursive: true });
  const readEndpoint = () => JSON.parse(readFileSync(resolve(data, 'endpoint.json'), 'utf8'));
  const attach = async (endpoint: { address: string; credential: string }) => {
    const transport = new LocalCoreTransport(data, endpoint);
    try {
      return { transport, session: await transport.connect(options) };
    } catch (error) {
      await transport.close();
      throw error;
    }
  };
  let previous;
  try {
    previous = readEndpoint();
    return await attach(previous);
  } catch (error) {
    if ((error as Error).message === 'CORE_AUTH_CLOSED' && previous) {
      // Another client may already be starting this Core. Only a newly
      // published instance permits another handshake; never replay mutations.
      const deadline = Date.now() + 10000;
      do {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const current = readEndpoint();
        if (current.instance !== previous.instance && current.credential !== previous.credential)
          return await attach(current);
      } while (Date.now() < deadline);
      throw error;
    }
    const code = (error as NodeJS.ErrnoException).code;
    if (!['ENOENT', 'ECONNREFUSED'].includes(code ?? '')) throw error;
  }
  // 固定构建产物，不执行 Renderer 提供的可执行文件或参数。
  const child = spawn(
    resolve(buildDir, 'core-node.exe'),
    [resolve(buildDir, '../w11-core/core.mjs')],
    {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: data,
        TMP: data,
        AGENTROUTER_DATA: data,
        AGENTROUTER_PROJECT_ROOTS: JSON.stringify([data]),
      },
    },
  );
  let failure: Error | undefined;
  child.on('error', (error) => {
    failure = error;
  });
  child.unref();
  const end = Date.now() + 10000;
  do {
    if (failure) throw failure;
    try {
      // Endpoint publication follows runtime initialization. A previous Core's
      // credential must not be sent to the newly listening process.
      const endpoint = readEndpoint();
      if (endpoint.pid !== child.pid) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      return await attach(endpoint);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['ENOENT', 'ECONNREFUSED'].includes(code ?? '')) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < end);
  throw Error('CORE_START_FAILED');
}
