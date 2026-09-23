// Fixed, non-detaching parent/grandchild fixture. No arbitrary command input or real provider.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
const role = process.argv[2];
writeFileSync(join(process.cwd(), `${role}.pid`), String(process.pid));
if (role === 'fixed-parent') spawn(process.execPath, [import.meta.filename, 'fixed-child'], { stdio: 'ignore' });
else {
  const server = createServer();
  server.on('error', error => {
    if (!['EPERM','EACCES'].includes(error.code)) process.exit(2);
    writeFileSync(join(process.cwd(), 'port-denied'), 'SYNTHETIC OS loopback listener denied');
  });
  server.listen(0, '127.0.0.1', () => { writeFileSync(join(process.cwd(), 'unexpected-port'), String(server.address().port)); process.exit(3); });
}
setInterval(() => writeFileSync(join(process.cwd(), `${role}.heartbeat`), String(Date.now())), 20);
