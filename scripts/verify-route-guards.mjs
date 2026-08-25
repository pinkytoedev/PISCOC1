/**
 * Asserts the unauthenticated route surface is exactly what we intend.
 *
 *   npx tsx scripts/verify-route-guards.mjs
 *
 * Walks Express's live router stack, so it sees what the server actually
 * registers rather than what the source appears to say. Every route that is
 * not behind a session, an admin check, an upload token or the webhook secret
 * must be listed below with a reason.
 *
 * This exists because that surface is easy to widen by accident. Converting a
 * router-level `router.use(isAuthenticated)` into per-route guards silently
 * left three status endpoints open, and nothing else in the suite noticed.
 */

import express from 'express';
import { registerRoutes } from '../server/routes/index.ts';

/** Routes that are unauthenticated on purpose, and why. */
const INTENTIONALLY_PUBLIC = new Map([
  ['GET /api/health', 'platform health probe; reports booleans only'],
  ['POST /api/login', 'credential entry point'],
  ['POST /api/logout', 'must work even with an expired session'],
  ['GET /api/public/team-upload-status', 'tells the public page whether to render'],
  ['GET /api/public/team-roles', 'gated at runtime by the team_upload_enabled setting'],
  ['GET /api/public/team-members-list', 'gated at runtime by the team_upload_enabled setting'],
  ['POST /api/public/team-member-update', 'gated at runtime by the team_upload_enabled setting'],
]);

const GUARDS = ['isAuthenticated', 'isAdmin', 'verifyWebhookSecret'];
const TOKEN_GUARDED = /^\/api\/public-upload\/:token/;

function guardOf(layer) {
  const names = (layer.route?.stack ?? []).map((s) => s.name);
  return GUARDS.find((g) => names.includes(g)) ?? null;
}

function walk(stack, prefix, out, inherited) {
  for (const layer of stack) {
    if (layer.route) {
      const guard = guardOf(layer) ?? inherited;
      for (const method of Object.keys(layer.route.methods).filter((m) => m !== '_all')) {
        const path = (prefix + layer.route.path).replace(/\/{2,}/g, '/') || '/';
        out.push({
          method: method.toUpperCase(),
          path,
          guard: guard ?? (TOKEN_GUARDED.test(path) ? 'uploadToken' : null),
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

const app = express();
await registerRoutes(app);

const routes = [];
walk(app._router?.stack ?? app.router?.stack ?? [], '', routes, null);

const seen = new Set();
const unique = routes.filter((r) => {
  const key = `${r.method} ${r.path}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const unguarded = unique.filter((r) => r.guard === null).map((r) => `${r.method} ${r.path}`);
const unexpected = unguarded.filter((r) => !INTENTIONALLY_PUBLIC.has(r));
const stale = [...INTENTIONALLY_PUBLIC.keys()].filter((r) => !unguarded.includes(r));

console.log(`${unique.length} routes registered`);
const counts = unique.reduce(
  (acc, r) => ({ ...acc, [r.guard ?? 'PUBLIC']: (acc[r.guard ?? 'PUBLIC'] ?? 0) + 1 }),
  {},
);
for (const [guard, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${guard.padEnd(20)} ${n}`);
}

if (unexpected.length) {
  console.log('\nUNEXPECTED PUBLIC ROUTES — add a guard, or document it in this file:');
  for (const r of unexpected) console.log(`  ✗ ${r}`);
}

if (stale.length) {
  console.log('\nStale allowlist entries (now guarded, or removed) — delete these:');
  for (const r of stale) console.log(`  · ${r}`);
}

if (!unexpected.length && !stale.length) {
  console.log('\nPublic surface matches the allowlist exactly.');
}

// Stale entries fail too. CI runs this as a hard gate, and an allowlist that
// only ever grows stops describing the real public surface — at which point a
// genuinely new public route can hide behind an entry left over from a route
// that was guarded or deleted years earlier.
process.exit(unexpected.length || stale.length ? 1 : 0);
