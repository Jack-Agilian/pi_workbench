import './check-environment.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (['--demo','--model','--model-offline','--model-files-offline'].filter(m=>process.argv.includes(m)).length !== 1) throw new Error('exactly_one_launch_mode_required');
const mode=process.argv.includes('--model')?'--model':process.argv.includes('--model-offline')?'--model-offline':process.argv.includes('--model-files-offline')?'--model-files-offline':'--demo';
const config=process.argv.find(a=>a.startsWith('--model-config='))?.slice('--model-config='.length)??join(homedir(),'Library/Application Support/Pi Workbench/model.json');
if (process.argv.slice(2).some(arg => !['--demo','--model','--model-offline','--model-files-offline','--model-smoke-test','--smoke-test','--shell-smoke-test'].includes(arg)&&!arg.startsWith('--model-config=')) || !['--demo','--model','--model-offline','--model-files-offline'].some(m=>process.argv.includes(m))) throw new Error('explicit_demo_required');
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('desktop_platform_not_verified');
const executable = join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
if (!existsSync(executable)) throw new Error('Run npm run prepare:desktop first; launch never downloads dependencies.');
await import('./build-desktop.mjs');
const modelTest=process.argv.includes('--model-smoke-test');
const shellTest = process.argv.includes('--shell-smoke-test');
const test = process.argv.includes('--smoke-test') || shellTest || modelTest;
const profile = test ? realpathSync(mkdtempSync(join(tmpdir(), 'pi-desktop-ui-'))) : (mode==='--demo'?join(root, '.artifacts/desktop-demo'):join(homedir(),'Library/Application Support/Pi Workbench',mode==='--model-files-offline'?'offline-files-profile':mode==='--model-offline'?'offline-profile':'model-profile'));
mkdirSync(join(profile, 'home/tmp'), { recursive: true });
const child = spawn(executable, [join(root, 'dist/desktop/main.mjs'), mode, ...(mode==='--model'?[`--model-config=${resolve(config)}`]:[]), `--host-node=${realpathSync(process.execPath)}`, `--demo-profile=${profile}`, ...(test ? [modelTest?'--model-smoke-test':shellTest ? '--shell-smoke-test' : '--smoke-test'] : [])], {
  cwd: profile, stdio: 'inherit', env: { HOME: join(profile, 'home'), TMPDIR: join(profile, 'home/tmp'), PATH: dirname(process.execPath),
    LANG: 'zh_CN.UTF-8', NO_COLOR: '1' },
});
const stop = () => child.kill('SIGTERM'); process.on('SIGINT', stop); process.on('SIGTERM', stop);
let timer;
if (test) timer = setTimeout(() => child.kill('SIGTERM'), 120_000);
try { process.exitCode = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', code => resolveExit(code ?? 1)); }); }
finally { clearTimeout(timer); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); if (test) rmSync(profile, { recursive: true, force: true }); }
