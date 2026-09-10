import { MockP1Server } from './mock-p1.ts';
import { JsonLfDecoder } from '../platform/framing.ts';
import { C1R1Error } from '../client-contract/c1r1p1/index.ts';
const server = new MockP1Server(),
  connection = server.open('mock_stdio'),
  decoder = new JsonLfDecoder();
server.subscribe(connection, (e) => process.stdout.write(JSON.stringify(e) + '\n'));
process.stdin.on('data', async (b) => {
  try {
    for (const frame of decoder.push(b)) {
      const result = await server.handle(connection, frame);
      process.stdout.write(JSON.stringify(result) + '\n');
    }
  } catch {
    process.exitCode = 1;
    process.stdin.destroy();
  }
});
process.stdin.on('end', () => {
  server.disconnect(connection);
  try {
    decoder.end();
  } catch {
    process.exitCode = 1;
  }
});
