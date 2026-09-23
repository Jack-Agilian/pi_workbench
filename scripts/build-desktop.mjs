import './check-environment.mjs';
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'); const out = join(root, 'dist/desktop');
mkdirSync(out, { recursive: true });
const common = { absWorkingDir: root, bundle: true, logLevel: 'warning', metafile: true };
const results = await Promise.all([
  build({ ...common, entryPoints: ['apps/desktop/main.ts'], outfile: join(out, 'main.mjs'), platform: 'node', format: 'esm', target: 'node24', external: ['electron'] }),
  build({ ...common, entryPoints: ['apps/desktop/preload.ts'], outfile: join(out, 'preload.cjs'), platform: 'node', format: 'cjs', target: 'node24', external: ['electron'] }),
  build({ ...common, entryPoints: ['apps/desktop/renderer.tsx'], outfile: join(out, 'renderer.js'), platform: 'browser', format: 'esm', target: 'chrome150', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } }),
]);
const rendererImports = Object.keys(results[2].metafile.inputs);
if (rendererImports.some(path => path.includes('pi-adapter') || path.includes('agent-server') || path.includes('@earendil'))) throw new Error('renderer_privileged_import');
for (const name of ['index.html','style.css']) copyFileSync(join(root, 'apps/desktop', name), join(out, name));
writeFileSync(join(out, 'build-inputs.json'), JSON.stringify(results.map(r => r.metafile), null, 2));
console.log('Desktop built; Renderer has no Pi/host imports.');
