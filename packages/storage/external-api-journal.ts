import type Database from 'better-sqlite3';
import type {
  ExternalApiJournal,
  ExternalApiResult,
} from '../management-gateway/external-api-registry.js';

/** Core's existing database; durable claims never expire or become eligible for automatic retry. */
export function createExternalApiJournal(
  db: Database.Database,
  principal: string,
  clientId: string,
): ExternalApiJournal {
  if (!principal || !clientId || principal.length > 256 || clientId.length > 256)
    throw Error('API_JOURNAL_IDENTITY_INVALID');
  const validate = (key: string, fingerprint: string) => {
    if (!/^[A-Za-z0-9_.:-]{1,256}$/.test(key) || !/^[a-f0-9]{64}$/.test(fingerprint))
      throw Error('API_JOURNAL_INPUT_INVALID');
  };
  return {
    async claim(key, fingerprint) {
      validate(key, fingerprint);
      return db
        .transaction(() => {
          const row = db
            .prepare(
              'select fingerprint,state,result_json from external_api_calls where principal=? and client_id=? and operation_id=?',
            )
            .get(principal, clientId, key) as
            { fingerprint: string; state: string; result_json: string | null } | undefined;
          if (row) {
            const result: ExternalApiResult | undefined =
              row.state === 'IN_FLIGHT'
                ? undefined
                : row.state === 'UNKNOWN'
                  ? { state: 'UNKNOWN' }
                  : JSON.parse(row.result_json!);
            return {
              acquired: false as const,
              fingerprint: row.fingerprint,
              ...(result ? { result } : {}),
            };
          }
          const now = Date.now();
          db.prepare(
            "insert into external_api_calls(principal,client_id,operation_id,fingerprint,state,result_json,created_at_ms,updated_at_ms) values(?,?,?,?,'IN_FLIGHT',null,?,?)",
          ).run(principal, clientId, key, fingerprint, now, now);
          return { acquired: true as const };
        })
        .immediate();
    },
    async settle(key, fingerprint, result) {
      validate(key, fingerprint);
      if (!result || !['SUCCEEDED', 'UNKNOWN'].includes(result.state))
        throw Error('API_JOURNAL_RESULT_INVALID');
      // Only already-redacted registry output reaches this port.
      const json = JSON.stringify(result);
      if (Buffer.byteLength(json) > 1048704) throw Error('API_JOURNAL_RESULT_TOO_LARGE');
      db.transaction(() => {
        const updated = db
          .prepare(
            "update external_api_calls set state=?,result_json=?,updated_at_ms=? where principal=? and client_id=? and operation_id=? and fingerprint=? and state='IN_FLIGHT'",
          )
          .run(result.state, json, Date.now(), principal, clientId, key, fingerprint);
        if (updated.changes !== 1) throw Error('API_JOURNAL_SETTLE_CONFLICT');
      }).immediate();
    },
  };
}
