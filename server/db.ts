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
    ssl: env.isProduction
        ? {
            // Verify the server certificate. Providers that terminate TLS with a
            // private CA supply it via DATABASE_CA_CERT; disabling verification
            // outright would leave the connection open to interception.
            rejectUnauthorized: true,
            ca: env.databaseCa,
        }
        : false,
});

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
