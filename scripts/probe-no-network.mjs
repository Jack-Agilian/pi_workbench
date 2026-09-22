// Accidental-network tripwire, loaded before all SDK imports. Not a hostile-code sandbox.
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import dgram from 'node:dgram';

let attempts = 0;
const deny = () => {
  attempts++;
  // No URL, headers, payload or environment values in diagnostics.
  throw new Error('A1_NETWORK_FORBIDDEN');
};
for (const [object, names] of [
  [net, ['connect', 'createConnection']],
  [net.Socket.prototype, ['connect']],
  [net.Server.prototype, ['listen']],
  [tls, ['connect']],
  [http, ['request', 'get']],
  [https, ['request', 'get']],
  [http2, ['connect']],
  [dgram, ['createSocket']],
  ...[dns, dnsPromises, dns.Resolver.prototype, dnsPromises.Resolver.prototype].map(object =>
    [object, Object.getOwnPropertyNames(object).filter(name => /^(lookup|resolve|reverse)/.test(name))]),
]) {
  for (const name of names) Object.defineProperty(object, name, { value: deny, writable: false, configurable: false });
}
globalThis.fetch = deny;
globalThis.WebSocket = class { constructor() { deny(); } };
syncBuiltinESMExports();
// Even if a library catches the exception, the test process must fail.
process.on('exit', () => { if (attempts) process.exitCode = 97; });
