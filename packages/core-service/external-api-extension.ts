import type Database from 'better-sqlite3';
import {
  validateExternalApiFrame,
  extensionReply,
  extensionErrorReply,
  type ExternalApiFrame,
} from '../client-contract/external-api-1.ts';
import {
  ExternalApiRegistry,
  type ExternalApiJournal,
} from '../management-gateway/external-api-registry.ts';
import { createExternalApiJournal } from '../storage/external-api-journal.ts';
export interface ExternalApiCallContext {
  principal: string;
  clientId?: string;
  mode?: string;
  /** Connection-bound controller lease check, supplied by ApplicationService. */
  assertControllerLease: (leaseId: string) => void;
}
/** Core-owned extension dispatch. Identity comes from the authenticated connection;
 * calls additionally require the controller lease of the same connection. */
export class ExternalApiExtension {
  constructor(
    private readonly registry: ExternalApiRegistry,
    private readonly db: Database.Database,
  ) {}
  async handle(raw: unknown, context: ExternalApiCallContext): Promise<unknown> {
    try {
      const frame: ExternalApiFrame = validateExternalApiFrame(raw);
      let result: unknown;
      if (frame.method === 'externalApi.list') result = { profiles: this.registry.list() };
      else if (frame.method === 'externalApi.describe')
        result = this.registry.describe(
          String(frame.params!.profile_id),
          String(frame.params!.action_id),
        );
      else {
        if (context.mode !== 'controller') throw Error('CONTROL_LEASE_REQUIRED');
        context.assertControllerLease(frame.lease_id!);
        result = await this.registry.call(
          {
            profile_id: String(frame.params!.profile_id),
            action_id: String(frame.params!.action_id),
            args: frame.params!.args as Record<string, unknown>,
          request_key: String(frame.params!.request_key),
          ...(typeof frame.params!.confirm === 'string'
            ? { confirm: String(frame.params!.confirm) }
            : {}),
          },
          this.journalFor(context),
        );
      }
      return extensionReply(frame.id, result);
    } catch (error) {
      const rawId = (raw as { id?: unknown })?.id;
      return extensionErrorReply(typeof rawId === 'string' ? rawId : 'unknown', error);
    }
  }
  private journalFor(context: ExternalApiCallContext): ExternalApiJournal {
    if (!context.clientId) throw Error('EXTERNAL_API_IDENTITY_REQUIRED');
    return createExternalApiJournal(this.db, context.principal, context.clientId);
  }
}
