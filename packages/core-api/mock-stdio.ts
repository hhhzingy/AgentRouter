import { MockCoreServer } from './mock-server.ts';
import { clientDecoder, encodeFrame } from '../client-transport/framing.ts';
const server = new MockCoreServer();
const connection = server.open('mock_stdio_operator');
server.subscribe(connection, (event) => process.stdout.write(encodeFrame(event)));
let queue = Promise.resolve();
const decoder = clientDecoder((frame) => {
  queue = queue
    .then(async () => {
      const response = await server.handle(connection, frame);
      process.stdout.write(encodeFrame(response));
    })
    .catch(() => {
      process.stderr.write('INVALID_CLIENT_FRAME\n');
      process.exitCode = 1;
      process.stdin.destroy();
    });
});
process.stdin.on('data', (chunk) => {
  try {
    decoder.push(chunk);
  } catch {
    process.stderr.write('INVALID_CLIENT_FRAME\n');
    process.exitCode = 1;
    process.stdin.destroy();
  }
});
process.stdin.on('end', () => {
  try {
    decoder.end();
  } catch {
    process.exitCode = 1;
  }
  void queue.finally(() => server.disconnect(connection));
});
