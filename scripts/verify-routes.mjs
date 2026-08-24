import crypto from 'crypto';
import { promisify } from 'util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);
const BASE = 'http://localhost:3999';

const pool = new pg.Pool({ connectionString: 'postgresql://jawednur@localhost:5432/piscoc_verify' });
const salt = crypto.randomBytes(16).toString('hex');
const buf = await scrypt('verify-password-123', salt, 64);
await pool.query(
  `INSERT INTO users (username,password,is_admin) VALUES ($1,$2,true)
   ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password`,
  ['verifier', `${buf.toString('hex')}.${salt}`],
);
await pool.end();

let cookies = {}, csrf = null;
const jar = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
const absorb = (r) => {
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(';'); const i = p.indexOf('=');
    cookies[p.slice(0, i)] = p.slice(i + 1);
  }
  if (cookies.csrf_token) csrf = cookies.csrf_token;
};

absorb(await fetch(`${BASE}/api/health`));
absorb(await fetch(`${BASE}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf, Cookie: jar() },
  body: JSON.stringify({ username: 'verifier', password: 'verify-password-123' }),
}));

let fails = 0;
const expect = async (label, path, want, opts = {}) => {
  const res = await fetch(BASE + path, { headers: opts.auth === false ? {} : { Cookie: jar() } });
  const ok = Array.isArray(want) ? want.includes(res.status) : res.status === want;
  if (!ok) fails++;
  console.log(`  ${ok ? '✓' : '✗'} ${String(res.status).padEnd(4)} ${path}${ok ? '' : `  (wanted ${want})`}`);
};

console.log('=== migrated resource routes, authenticated (expect 200) ===');
for (const p of [
  '/api/articles', '/api/articles/featured', '/api/articles/status/draft',
  '/api/team-members', '/api/carousel-quotes', '/api/carousel-quotes/by-carousel/main',
  '/api/admin-requests', '/api/image-assets', '/api/activity-logs',
  '/api/metrics', '/api/migration-progress', '/api/status',
  '/api/integration-status', '/api/integration-settings/airtable',
]) await expect('auth', p, 200);

console.log('\n=== must stay reachable without a session ===');
await expect('pub', '/api/health', 200, { auth: false });
await expect('pub', '/api/public/team-upload-status', 200, { auth: false });

console.log('\n=== must be rejected without a session (expect 401) ===');
for (const p of [
  '/api/articles', '/api/articles/featured', '/api/team-members',
  '/api/metrics', '/api/activity-logs', '/api/integration-settings/airtable',
]) await expect('unauth', p, 401, { auth: false });

console.log('\n=== admin-only (non-admin path checked separately) ===');
await expect('admin', '/api/integration-settings/airtable', 200);

console.log(`\n${fails === 0 ? 'ALL ROUTE CHECKS PASSED' : `${fails} ROUTE CHECK(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
