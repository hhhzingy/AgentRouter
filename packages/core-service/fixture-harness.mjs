// Isolated deterministic process. No provider, credential, filesystem tool or child spawning.
let pending = '',
  started = false,
  timer;
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');
function start(packet) {
  if (started) return;
  started = true;
  const scenario = packet.scenario ?? {};
  if (scenario.staleEpoch) emit({ key: 'stale', kind: 'accepted', epoch: packet.epoch - 1 });
  emit({ key: 'accepted', kind: 'accepted', epoch: packet.epoch, source: 'SIMULATED' });
  if (scenario.halfFrame && packet.mode === 'run') {
    process.stdout.write('{"kind":');
    process.exitCode = 17;
    process.stdin.destroy();
    return;
  }
  if (
    (scenario.crash && packet.mode === 'run') ||
    (packet.mode === 'bootstrap' && scenario.bootstrap === 'fail')
  ) {
    process.exit(17);
    return;
  }
  if (scenario.gap) emit({ key: 'gap', kind: 'gap', epoch: packet.epoch });
  if (packet.mode === 'bootstrap')
    emit({ key: 'charter', kind: 'charter', epoch: packet.epoch, charterHash: packet.charterHash });
  else {
    const steps = scenario.steps ?? [
      {
        tool: 'finish',
        payload: {
          outcome: 'succeeded',
          summary: '模拟交付',
          body: '隔离 FixtureHarness 结果',
          outputs: [],
        },
      },
    ];
    for (let i = 0; i < steps.length; i++) {
      const event = {
        key: 'tool_' + i,
        kind: 'tool',
        epoch: packet.epoch,
        operationId: 'fixture_op_' + i,
        ...steps[i],
      };
      emit(event);
      if (scenario.duplicate) emit(event);
    }
  }
  timer = setTimeout(
    () => {
      emit({ key: 'terminal', kind: 'terminal', epoch: packet.epoch, outcome: 'succeeded' });
      if (scenario.duplicate)
        emit({ key: 'terminal', kind: 'terminal', epoch: packet.epoch, outcome: 'succeeded' });
      setTimeout(
        () => process.exit(0),
        packet.mode === 'bootstrap' ? 0 : Math.min(scenario.exitDelayMs ?? 0, 5000),
      );
    },
    Math.min(
      packet.mode === 'bootstrap' ? (scenario.bootstrapDelayMs ?? 20) : (scenario.delayMs ?? 20),
      5000,
    ),
  );
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  pending += chunk;
  let i;
  while ((i = pending.indexOf('\n')) >= 0) {
    const text = pending.slice(0, i);
    pending = pending.slice(i + 1);
    try {
      const packet = JSON.parse(text);
      if (packet.cancel) {
        clearTimeout(timer);
        emit({ key: 'cancelled', kind: 'terminal', epoch: packet.epoch, outcome: 'cancelled' });
        process.exit(0);
      } else start(packet);
    } catch {
      process.exit(18);
    }
  }
});
process.stdin.on('end', () => process.exit(19));
