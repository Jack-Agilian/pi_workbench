import './check-environment.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.slice(2).some(arg => !['--demo','--smoke-test'].includes(arg)) || !process.argv.includes('--demo')) throw new Error('explicit_demo_required');
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('desktop_platform_not_verified');
const executable = join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
if (!existsSync(executable)) throw new Error('Run npm run prepare:desktop first; launch never downloads dependencies.');
await import('./build-desktop.mjs');
const test = process.argv.includes('--smoke-test');
const profile = test ? realpathSync(mkdtempSync(join(tmpdir(), 'pi-desktop-ui-'))) : join(root, '.artifacts/desktop-demo');
mkdirSync(join(profile, 'home/tmp'), { recursive: true });
const child = spawn(executable, [join(root, 'dist/desktop/main.mjs'), '--demo', `--host-node=${realpathSync(process.execPath)}`, `--demo-profile=${profile}`, ...(test ? ['--smoke-test'] : [])], {
  cwd: profile, stdio: 'inherit', env: { HOME: join(profile, 'home'), TMPDIR: join(profile, 'home/tmp'), PATH: dirname(process.execPath),
    LANG: 'zh_CN.UTF-8', NO_COLOR: '1' },
});
const stop = () => child.kill('SIGTERM'); process.on('SIGINT', stop); process.on('SIGTERM', stop);
let timer;
if (test) timer = setTimeout(() => child.kill('SIGTERM'), 120_000);
try { process.exitCode = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', code => resolveExit(code ?? 1)); }); }
finally { clearTimeout(timer); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); if (test) rmSync(profile, { recursive: true, force: true }); }
