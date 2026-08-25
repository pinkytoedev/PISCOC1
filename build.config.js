import { build } from 'esbuild';

// Bundles the server. `npm start` runs the output, and railway.toml's
// startCommand is `npm start`, so this is the only artifact that ships.
//
// There is deliberately no second bundle here. This file used to also emit
// dist/app.js from server/app.ts as an exported-Express-app entry point for
// Vercel — but nothing imports it, there is no vercel.json, and the project
// deploys to Railway as a process that listens. It was a second copy of the
// application that was built on every push and run nowhere, free to drift out
// of sync with server/index.ts.
await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outdir: 'dist',
  packages: 'external',
  banner: {
    js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`,
  },
});
