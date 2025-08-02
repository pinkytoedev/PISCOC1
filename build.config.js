import { build } from 'esbuild';
import { writeFileSync } from 'fs';

// Build the main server
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

// Create a separate app export for Vercel
await build({
    entryPoints: ['server/app.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: 'dist/app.js',
    packages: 'external',
    banner: {
        js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`,
    },
});