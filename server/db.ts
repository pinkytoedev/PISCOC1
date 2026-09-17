import { drizzle } from "drizzle-orm/node-postgres";
import pg from 'pg';
import { env } from './lib/env';

/**
 * Postgres connection pool.
 *
 * `max` is deliberately small: Railway's managed Postgres allows a modest
 * connection count and several replicas may share it.
 */
export const pgPool = new pg.Pool({
    connectionString: env.databaseUrl,
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    ssl: env.isProduction ? productionTls() : false,
});

/**
 * TLS settings for the production pool.
 *
 * Verification requires a CA to verify *against*. Railway's managed Postgres
 * terminates TLS with a self-signed certificate, so `rejectUnauthorized: true`
 * with no `ca` fails every query with "self-signed certificate in certificate
 * chain" — and it does not fall back.
 *
 * So verification is enabled only when DATABASE_CA_CERT actually supplies the
 * chain to check. Without it we connect over TLS but DO NOT verify the peer.
 * That is the documented posture for Railway's private network, where traffic
 * never leaves the project; it is not a safe posture over the public internet,
 * so set DATABASE_CA_CERT when the database is reached across one.
 *
 * (/api/health does probe the pool with `select 1` and answers 503 when it
 * fails, so an unusable connection no longer passes the container health check.)
 */
function productionTls(): { rejectUnauthorized: boolean; ca?: string } {
    if (env.databaseCa) {
        return { rejectUnauthorized: true, ca: env.databaseCa };
    }

    console.warn(
        '[db] DATABASE_CA_CERT is not set: connecting over TLS without verifying the ' +
        'server certificate. Set it to your provider CA to enable verification.',
    );
    return { rejectUnauthorized: false };
}

/**
 * A pooled connection can be dropped by the network or the server while idle.
 * Without a listener that arrives as an unhandled 'error' event and takes down
 * the process; pg discards the client and the next query opens a fresh one.
 */
pgPool.on('error', (err: Error) => {
    console.error(`[db] Idle client error (recovered): ${err.message}`);
});

export const db = drizzle(pgPool);

/** Closes the pool during shutdown so in-flight queries can finish. */
export async function closeDatabase(): Promise<void> {
    await pgPool.end();
}
