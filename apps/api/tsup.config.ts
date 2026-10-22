import { defineConfig } from 'tsup';

/** Optional native add-ons: never installed, loaded lazily by their parent package. */
const OPTIONAL_NATIVE = ['pg-native'];

// Bundled CommonJS code calls require() and reads __filename / __dirname; ESM has none of them.
const banner = [
  "import { createRequire as __bundleCreateRequire } from 'node:module';",
  "import { fileURLToPath as __bundleFileURLToPath } from 'node:url';",
  "import { dirname as __bundleDirname } from 'node:path';",
  'const require = __bundleCreateRequire(import.meta.url);',
  'const __filename = __bundleFileURLToPath(import.meta.url);',
  'const __dirname = __bundleDirname(__filename);',
].join('\n');

export default defineConfig({
  entry: { server: 'src/server.ts' },
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  // One self-contained file: bundle every dependency, no chunks.
  bundle: true,
  splitting: false,
  noExternal: [new RegExp(`^(?!(?:${OPTIONAL_NATIVE.join('|')})$)`)],
  external: OPTIONAL_NATIVE,
  banner: { js: banner },
  clean: true,
  sourcemap: false,
  minify: false,
  shims: false,
});
