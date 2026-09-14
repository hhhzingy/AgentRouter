import { expect, it } from 'vitest';
import {
  HarnessDriverRegistry,
  builtInDrivers,
  type HarnessDriver,
} from '../../packages/core-service/harness-drivers.ts';
import {
  capabilityRecord,
  unknownDriverContextCapabilities,
} from '../../packages/core-service/driver-context-capabilities.ts';

const lifecycle = () => ({
  async open() { return { id: 'native' }; },
  async start() {},
  async cancel() { return { state: 'requested' }; },
  accept() {},
  disconnect() {},
});

function driver(overrides: Partial<HarnessDriver> = {}): HarnessDriver {
  return {
    harness: 'test_driver',
    requiresSessionPath: false,
    processArgs: () => [],
    createLifecycle: () => lifecycle(),
    ...overrides,
  } as HarnessDriver;
}

it('无 capability evidence 时所有迁移能力保持 UNKNOWN', () => {
  const registry = new HarnessDriverRegistry();
  registry.register(driver());
  expect(registry.capabilities('test_driver')).toEqual({
    capabilities: unknownDriverContextCapabilities('test_driver'),
    evidence: [],
  });
});

it('拒绝 capability harness mismatch 且不污染 registry', () => {
  const registry = new HarnessDriverRegistry();
  expect(() => registry.register(driver({
    contextCapabilities: unknownDriverContextCapabilities('other_driver'),
  }))).toThrow('DRIVER_CAPABILITIES_HARNESS_MISMATCH');
  expect(registry.has('test_driver')).toBe(false);
});

it('probe 结果必须经过同一 shape/harness 校验', async () => {
  const registry = new HarnessDriverRegistry();
  const capabilities = { ...unknownDriverContextCapabilities('test_driver'), context_usage: 'ESTIMATED' as const };
  registry.register(driver({
    probeContextCapabilities: () => capabilityRecord(capabilities, [{
      source: 'test', reference: 'driver-context-capabilities.test', observed_at_ms: 1,
    }]),
  }));
  await expect(registry.probeContextCapabilities('test_driver', { config: {} as never })).resolves.toMatchObject({
    capabilities,
    evidence: [{ reference: 'driver-context-capabilities.test' }],
  });
});

it('内置 Driver 只声明代码层 resume 为 IMPLEMENTED_UNVERIFIED', () => {
  const registry = builtInDrivers();
  for (const harness of registry.list()) {
    const { capabilities } = registry.capabilities(harness);
    expect(capabilities.native_resume).toBe('IMPLEMENTED_UNVERIFIED');
    expect(capabilities.context_capacity).toBe('UNKNOWN');
    expect(capabilities.context_usage).toBe('UNKNOWN');
    expect(capabilities.native_compaction).toBe('UNKNOWN');
    expect(capabilities.model_switch_same_session).toBe('UNKNOWN');
  }
});
