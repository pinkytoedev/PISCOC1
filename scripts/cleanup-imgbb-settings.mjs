/**
 * Removes leftover ImgBB rows from `integration_settings`.
 *
 *   npx tsx scripts/cleanup-imgbb-settings.mjs            # show what would go
 *   npx tsx scripts/cleanup-imgbb-settings.mjs --confirm  # delete it
 *
 * The ImgBB API key used to be editable in the CMS and stored in this table.
 * It is now read from `IMGBB_API_KEY` and nothing consults the table for it, so
 * any surviving row is a plaintext credential sitting in the database doing
 * nothing — and, worse, one an operator could still find and believe is live.
 *
 * Dry run by default. Deleting credentials is not something a script should do
 * because someone typed its name to see what it was, so the destructive pass is
 * opt-in and prints the same list first either way.
 *
 * Safe to re-run: once the rows are gone it reports nothing to do and exits 0.
 *
 * It cleans whatever `DATABASE_URL` points at, and under `railway run` that is
 * the linked environment's database — `production` unless someone linked
 * another one. Check `railway status` first. The dry run prints which rows it
 * found, which is also the cheapest way to notice you are pointed at the wrong
 * database.
 *
 * Connects through `server/db.ts` rather than opening its own pool, so it gets
 * the same TLS handling as the server — a hand-rolled `pg.Pool` here would fail
 * against Railway's self-signed certificate.
 */

import { eq } from 'drizzle-orm';
import { integrationSettings } from '../shared/schema.ts';
import { db, pgPool } from '../server/db.ts';
import { redactIntegrationSetting } from '../server/lib/redact.ts';

const SERVICE = 'imgbb';
const confirmed = process.argv.includes('--confirm');

/**
 * Host and database name, without the credentials.
 *
 * Printed before anything else because "am I pointed at production?" is the
 * only question that matters here, and `railway run` answers it somewhere the
 * operator is not looking.
 */
function describeTarget() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '(could not parse DATABASE_URL)';
  }
}

/** Exits cleanly whatever happened, so a dangling pool cannot hang CI. */
async function main() {
  console.log(`Database: ${describeTarget()}\n`);

  const rows = await db
    .select()
    .from(integrationSettings)
    .where(eq(integrationSettings.service, SERVICE));

  if (rows.length === 0) {
    console.log(`Nothing to do: no "${SERVICE}" rows in integration_settings.`);
    return 0;
  }

  console.log(`Found ${rows.length} "${SERVICE}" row${rows.length === 1 ? '' : 's'}:`);
  for (const row of rows) {
    // Masked on the way to the terminal for the same reason the API masks it:
    // the point of this script is that the value should stop existing, not get
    // copied into someone's scrollback.
    const { value, redacted } = redactIntegrationSetting(row);
    console.log(
      `  #${row.id}  ${row.key} = ${value || '(empty)'}` +
        `${redacted ? '' : '  (not treated as a secret)'}` +
        `  enabled=${row.enabled}`,
    );
  }

  if (!confirmed) {
    console.log('\nDry run. Re-run with --confirm to delete these rows.');
    return 0;
  }

  const deleted = await db
    .delete(integrationSettings)
    .where(eq(integrationSettings.service, SERVICE))
    .returning({ id: integrationSettings.id });

  console.log(`\nDeleted ${deleted.length} row${deleted.length === 1 ? '' : 's'}.`);
  console.log('ImgBB now reads its key from IMGBB_API_KEY only.');
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error('Cleanup failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pgPool.end();
}
