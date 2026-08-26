import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/server/index.ts', 'src/server/match.worker.ts'],
  outdir: 'dist/server',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  // 'ws' fica externo para o Node resolver do node_modules (tem binding opcional).
  external: ['ws'],
  banner: {
    js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[build-server] observando mudancas...');
} else {
  await esbuild.build(options);
  console.log('[build-server] ok');
}
