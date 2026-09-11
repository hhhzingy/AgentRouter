import { expect, it } from 'vitest';
import {
  ExternalApiRegistry,
  type ExternalApiAction,
  type ExternalApiJournal,
  type ExternalApiResult,
} from '../../packages/management-gateway/external-api-registry.js';
function fixture(
  execute: ExternalApiAction['execute'] = async (args) => ({
    answer: args.prompt,
    token: 'FAKE SECRET',
  }),
  sideEffect: ExternalApiAction['sideEffect'] = 'READ_ONLY',
) {
  const records = new Map<string, { fingerprint: string; result?: ExternalApiResult }>();
  const journal: ExternalApiJournal = {
    async claim(key, fingerprint) {
      const found = records.get(key);
      if (found) return { acquired: false, ...found };
      records.set(key, { fingerprint });
      return { acquired: true };
    },
    async settle(key, fingerprint, result) {
      records.set(key, { fingerprint, result });
    },
  };
  const action: ExternalApiAction = {
    id: 'complete',
    inputSchema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    },
    sideEffect,
    execute,
    redact: (raw) => ({ answer: (raw as any).answer }),
  };
  const profiles = [
    { id: 'provider', displayName: 'Registered Provider', enabled: true, actions: [action] },
  ];
  const registry = new ExternalApiRegistry(profiles, journal);
  const input = {
    profile_id: 'provider',
    action_id: 'complete',
    args: { prompt: 'small' },
    request_key: 'stable',
  };
  return { registry, input, journal, profiles, records };
}
it('lists only aliases/actions and redacts output before persisting', async () => {
  const f = fixture();
  expect(f.registry.list()).toEqual([
    { id: 'provider', displayName: 'Registered Provider', actions: ['complete'] },
  ]);
  expect(f.registry.describe('provider', 'complete').confirmationRequired).toBe(false);
  expect(await f.registry.call(f.input)).toEqual({
    state: 'SUCCEEDED',
    output: { answer: 'small' },
  });
  expect(JSON.stringify([...f.records.values()])).not.toContain('FAKE SECRET');
});
it('rejects unknown actions, transport fields and mismatched request keys', async () => {
  const f = fixture();
  await expect(f.registry.call({ ...f.input, action_id: 'http' })).rejects.toThrow(
    'API_ACTION_UNAVAILABLE',
  );
  await expect(
    f.registry.call({ ...f.input, args: { ...f.input.args, url: 'https://unregistered.invalid' } }),
  ).rejects.toThrow('API_INPUT_INVALID');
  await f.registry.call(f.input);
  await expect(f.registry.call({ ...f.input, args: { prompt: 'different' } })).rejects.toThrow(
    'API_REQUEST_KEY_CONFLICT',
  );
});
it('never retries unknown side effects across registry recreation', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    throw Error('possibly completed externally');
  });
  expect(await f.registry.call(f.input)).toEqual({ state: 'UNKNOWN' });
  const restarted = new ExternalApiRegistry(f.profiles, f.journal);
  expect(await restarted.call(f.input)).toEqual({ state: 'UNKNOWN' });
  expect(calls).toBe(1);
});
it('reserves before dispatch and does not repeat a concurrent pending action', async () => {
  let release!: () => void,
    calls = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = fixture(async () => {
    calls++;
    await gate;
    return { answer: 'done' };
  });
  const first = f.registry.call(f.input);
  expect(await f.registry.call(f.input)).toEqual({ state: 'UNKNOWN' });
  release();
  expect(await first).toEqual({ state: 'SUCCEEDED', output: { answer: 'done' } });
  expect(calls).toBe(1);
});
it('requires payload-bound preview confirmation for writes', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return { answer: 'done' };
  }, 'WRITE');
  const preview = await f.registry.call(f.input);
  expect(preview.state).toBe('PREVIEW');
  expect(calls).toBe(0);
  if (preview.state !== 'PREVIEW') throw Error('missing preview');
  expect((await f.registry.call({ ...f.input, confirm: preview.confirmation })).state).toBe(
    'SUCCEEDED',
  );
  expect(calls).toBe(1);
});
