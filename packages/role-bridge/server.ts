import { createServer, type Server } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Core, type Identity } from '../runtime/core.ts';
import { RouteError } from '../protocol/index.ts';
export class RoleBridge {
  private principals = new Map<string, Identity>();
  private server?: Server;
  endpoint = '';
  constructor(readonly core: Core) {}
  issue(principal: Identity) {
    if (principal.management || !principal.runId) throw new RouteError('BRIDGE_REQUIRES_RUN');
    const token = randomBytes(32).toString('hex');
    this.principals.set(token, Object.freeze({ ...principal }));
    return token;
  }
  revoke(token: string) {
    this.principals.delete(token);
  }
  async listen() {
    this.server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      const fail = (status: number, error: RouteError) => {
        res.statusCode = status;
        res.end(JSON.stringify({ error: error.toJSON() }));
      };
      if (
        req.method !== 'POST' ||
        req.url !== '/tools' ||
        req.headers.origin !== undefined ||
        req.headers.host !== new URL(this.endpoint).host
      ) {
        fail(403, new RouteError('BRIDGE_BOUNDARY', 'AUTHORIZATION'));
        return;
      }
      const token = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : '';
      let p: Identity | undefined;
      for (const [key, value] of this.principals) {
        if (key.length === token.length && timingSafeEqual(Buffer.from(key), Buffer.from(token)))
          p = value;
      }
      if (!p) {
        fail(401, new RouteError('INVALID_BRIDGE_TOKEN', 'AUTHORIZATION'));
        return;
      }
      try {
        let size = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 262144) throw new RouteError('PACKET_BYTE_LIMIT');
          chunks.push(chunk);
        }
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (
          !payload ||
          Object.keys(payload).some((k) => !['tool', 'operation_id', 'input'].includes(k))
        )
          throw new RouteError('INVALID_ENVELOPE');
        if (p.grantedTools && !p.grantedTools.includes(payload.tool))
          throw new RouteError('TOOL_NOT_GRANTED', 'AUTHORIZATION');
        let result;
        if (payload.tool === 'route_send')
          result = this.core.send(p, payload.operation_id, payload.input);
        else if (payload.tool === 'route_finish')
          result = this.core.finish(p, payload.operation_id, payload.input);
        else if (payload.tool === 'route_wait')
          result = this.core.wait(p, payload.operation_id, payload.input);
        else if (payload.tool === 'route_context') result = this.core.context(p, payload.input);
        else if (payload.tool === 'route_artifact_register')
          result = this.core.registerArtifact(p, payload.operation_id, payload.input);
        else if (payload.tool === 'route_artifact_read')
          result = this.core.readArtifact(p, payload.input);
        else throw new RouteError('TOOL_UNAVAILABLE', 'UNAVAILABLE');
        res.end(JSON.stringify({ result }));
      } catch (e) {
        fail(
          e instanceof RouteError && e.category === 'AUTHORIZATION' ? 403 : 400,
          e instanceof RouteError ? e : new RouteError('INVALID_JSON'),
        );
      }
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (!address || typeof address === 'string') throw Error('BRIDGE_BIND_FAILED');
    this.endpoint = `http://127.0.0.1:${address.port}/tools`;
    return this.endpoint;
  }
  async close() {
    this.principals.clear();
    await new Promise<void>((res, rej) => {
      this.server?.close((e) => (e ? rej(e) : res()));
      this.server?.closeAllConnections();
    });
  }
}
