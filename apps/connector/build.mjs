import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');
const origins = JSON.parse(await readFile('origins.json', 'utf8'));

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const allowed = dev ? [...origins.site, ...origins.dev] : origins.site;
manifest.externally_connectable = { matches: allowed.map((o) => `${o}/*`) };
if (dev) manifest.name += ' (dev)';
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2));
await copyFile('src/connect.html', 'dist/connect.html');

const options = {
  entryPoints: { background: 'src/background.ts', connect: 'src/connect.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  define: { __ALLOWED_ORIGINS__: JSON.stringify(allowed) },
  sourcemap: dev,
  logLevel: 'info',
};

if (watch) await (await context(options)).watch();
else await build(options);
