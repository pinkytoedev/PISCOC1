/**
 * Regenerates the endpoint tables in `docs/api.md` from the live router stack.
 *
 *   npx tsx scripts/generate-api-docs.mjs          # rewrite the tables
 *   npx tsx scripts/generate-api-docs.mjs --check  # fail if they are stale
 *
 * The prose in `docs/api.md` is hand-written and is never touched; only the
 * block between the GENERATED markers is replaced. That block is derived by
 * walking Express's router the same way `list-routes.mjs` does, so the endpoint
 * inventory cannot drift from the server the way a hand-maintained table does —
 * which is exactly how the previous version of that document ended up missing a
 * quarter of the routes and still describing an integration that had been
 * deleted.
 *
 * Run with --check in CI to make adding a route without documenting it a
 * failure rather than a slow decay.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { registerRoutes } from '../server/routes/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(HERE, '..', 'docs', 'api.md');

const BEGIN = '<!-- BEGIN GENERATED ROUTES -->';
const END = '<!-- END GENERATED ROUTES -->';

const GUARDS = ['isAuthenticated', 'isAdmin', 'verifyWebhookSecret'];
const TOKEN_GUARDED = /^\/api\/public-upload\/:token/;

/** How each guard is described to a reader of the document. */
const GUARD_LABEL = {
  PUBLIC: 'public',
  isAuthenticated: 'auth',
  isAdmin: 'admin',
  uploadToken: 'token',
  verifyWebhookSecret: 'webhook',
};

/**
 * Groups, in the order they should appear. First matching prefix wins, so the
 * more specific patterns are listed above the general ones.
 */
const GROUPS = [
  { title: 'Authentication and users', match: (p) => /^\/api\/(login|logout|user|users|register)\b/.test(p) },
  { title: 'System', match: (p) => /^\/api\/(health|metrics|status|integration-status|migration-progress|activity-logs)\b/.test(p) },
  { title: 'Articles', match: (p) => p.startsWith('/api/articles') },
  { title: 'Team members', match: (p) => p.startsWith('/api/team-members') },
  { title: 'Carousel quotes', match: (p) => p.startsWith('/api/carousel-quotes') },
  { title: 'Admin requests', match: (p) => p.startsWith('/api/admin-requests') },
  { title: 'Image assets', match: (p) => p.startsWith('/api/image-assets') },
  { title: 'Contributor upload links', match: (p) => p.startsWith('/api/upload-links') || p.startsWith('/api/public-upload') },
  { title: 'Editor uploads', match: (p) => p.startsWith('/api/direct-upload') },
  { title: 'Public team profiles', match: (p) => p.startsWith('/api/public/') },
  { title: 'Airtable', match: (p) => p.startsWith('/api/airtable') },
  { title: 'ImgBB', match: (p) => p.startsWith('/api/imgbb') },
  { title: 'Integration settings', match: (p) => p.startsWith('/api/integration-settings') },
  { title: 'Webhooks', match: (p) => p.startsWith('/api/webhooks') },
];

function guardOf(layer) {
  const names = (layer.route?.stack ?? []).map((s) => s.name);
  return GUARDS.find((g) => names.includes(g)) ?? null;
}

function walk(stack, prefix, out, inherited) {
  for (const layer of stack) {
    if (layer.route) {
      const guard = guardOf(layer) ?? inherited;
      for (const method of Object.keys(layer.route.methods).filter((m) => m !== '_all')) {
        const routePath = (prefix + layer.route.path).replace(/\/{2,}/g, '/') || '/';
        out.push({
          method: method.toUpperCase(),
          path: routePath,
          guard: guard ?? (TOKEN_GUARDED.test(routePath) ? 'uploadToken' : 'PUBLIC'),
        });
      }
      continue;
    }

    if (layer.name === 'router' && layer.handle?.stack) {
      const match = (layer.regexp?.source ?? '').match(/^\^\\\/(.*?)\\\/\?/);
      const mounted = match ? `/${match[1].replace(/\\\//g, '/')}` : '';
      const routerGuard =
        layer.handle.stack.find((s) => !s.route && GUARDS.includes(s.name))?.name ?? inherited;
      walk(layer.handle.stack, prefix + mounted, out, routerGuard);
    }
  }
}

const METHOD_ORDER = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };

function renderTables(routes) {
  const remaining = [...routes];
  const sections = [];

  for (const group of GROUPS) {
    const taken = remaining.filter((r) => group.match(r.path));
    if (taken.length === 0) continue;
    for (const route of taken) remaining.splice(remaining.indexOf(route), 1);

    taken.sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        (METHOD_ORDER[a.method] ?? 9) - (METHOD_ORDER[b.method] ?? 9),
    );

    const rows = taken
      .map((r) => `| ${r.method} | \`${r.path}\` | ${GUARD_LABEL[r.guard] ?? r.guard} |`)
      .join('\n');

    sections.push(`#### ${group.title}\n\n| | Endpoint | Access |\n|---|---|---|\n${rows}`);
  }

  if (remaining.length > 0) {
    const rows = remaining
      .map((r) => `| ${r.method} | \`${r.path}\` | ${GUARD_LABEL[r.guard] ?? r.guard} |`)
      .join('\n');
    sections.push(`#### Other\n\n| | Endpoint | Access |\n|---|---|---|\n${rows}`);
  }

  const counts = routes.reduce((acc, r) => {
    const label = GUARD_LABEL[r.guard] ?? r.guard;
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  const summary =
    `${routes.length} endpoints: ` +
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, n]) => `${n} ${label}`)
      .join(', ') +
    '.';

  return [
    '',
    `<!-- Generated by scripts/generate-api-docs.mjs — do not edit by hand. -->`,
    '',
    summary,
    '',
    sections.join('\n\n'),
    '',
  ].join('\n');
}

const app = express();
await registerRoutes(app);

const collected = [];
walk(app._router?.stack ?? app.router?.stack ?? [], '', collected, null);

const seen = new Set();
const routes = collected.filter((r) => {
  const key = `${r.method} ${r.path}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const existing = await fs.readFile(TARGET, 'utf8');
const beginAt = existing.indexOf(BEGIN);
const endAt = existing.indexOf(END);

if (beginAt === -1 || endAt === -1) {
  console.error(`${TARGET} is missing the ${BEGIN} / ${END} markers.`);
  process.exit(1);
}

const updated =
  existing.slice(0, beginAt + BEGIN.length) + renderTables(routes) + existing.slice(endAt);

if (process.argv.includes('--check')) {
  if (updated !== existing) {
    console.error(
      'docs/api.md is out of date with the router.\n' +
        'Run: npx tsx scripts/generate-api-docs.mjs',
    );
    process.exit(1);
  }
  console.log(`docs/api.md matches the router (${routes.length} endpoints).`);
  process.exit(0);
}

await fs.writeFile(TARGET, updated);
console.log(`Wrote ${routes.length} endpoints into docs/api.md`);
