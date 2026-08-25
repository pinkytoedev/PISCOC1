/**
 * Prints every route the server actually registers, with its auth guard.
 *
 *   npx tsx scripts/list-routes.mjs
 *
 * Walks Express's router stack rather than grepping the source, so nested
 * routers, mount prefixes and registration order are all reflected exactly as
 * the running server sees them. Registration order matters: a literal path
 * declared after a parameterised one on the same prefix is unreachable, and
 * this listing is what makes that visible.
 */

import express from 'express';
import { registerRoutes } from '../server/routes/index.ts';

const GUARDS = ['isAuthenticated', 'isAdmin', 'verifyWebhookSecret'];

/**
 * Contributor upload routes authorize themselves with the token in the URL.
 * That guard is a closure returned by `withToken()`, so it has no stable
 * function name to match on — recognise it by path instead, or it shows up
 * as unauthenticated and buries the real findings.
 */
const TOKEN_GUARDED = /^\/api\/public-upload\/:token/;

/** Identifies a guard by the handler's function name. */
function guardOf(layer) {
  const names = (layer.route?.stack ?? []).map((s) => s.name);
  for (const guard of GUARDS) {
    if (names.includes(guard)) return guard;
  }
  return null;
}

function walk(stack, prefix, out, inherited) {
  for (const layer of stack) {
    if (layer.route) {
      const guard = guardOf(layer) ?? inherited;
      const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all');
      for (const method of methods) {
        const path = (prefix + layer.route.path).replace(/\/{2,}/g, '/') || '/';
        out.push({
          method: method.toUpperCase(),
          path,
          guard: guard ?? (TOKEN_GUARDED.test(path) ? 'uploadToken' : 'PUBLIC'),
        });
      }
      continue;
    }

    if (layer.name === 'router' && layer.handle?.stack) {
      // Recover the mount path from the layer's regexp.
      const source = layer.regexp?.source ?? '';
      const match = source.match(/^\^\\\/(.*?)\\\/\?/);
      const mounted = match ? `/${match[1].replace(/\\\//g, '/')}` : '';

      // A guard applied with router.use() covers everything inside it.
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

unique.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const counts = unique.reduce((acc, r) => ({ ...acc, [r.guard]: (acc[r.guard] ?? 0) + 1 }), {});

console.log(`${unique.length} routes\n`);
for (const [guard, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${guard.padEnd(20)} ${n}`);
}
console.log();
for (const r of unique) {
  console.log(`${r.guard.padEnd(20)} ${r.method.padEnd(7)} ${r.path}`);
}

process.exit(0);
