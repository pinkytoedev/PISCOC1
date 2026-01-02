import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "node:process";
import pg from 'pg';

// Initialize Postgres connection
const connectionString = env.DATABASE_URL;

if (!connectionString) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24cff41f-8e01-42f2-95fa-5253479615ef', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'B',
            location: 'server/db.ts:connection-check',
            message: 'DATABASE_URL missing at startup',
            data: {},
            timestamp: Date.now()
        })
    }).catch(() => {});
    // #endregion
    throw new Error("DATABASE_URL environment variable is required");
}

// Configure connection pool with serverless-friendly settings
export const pgPool = new pg.Pool({
    connectionString,
    // Serverless-friendly connection pool settings
    max: 1, // Minimize connections in serverless
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// #region agent log
fetch('http://127.0.0.1:7242/ingest/24cff41f-8e01-42f2-95fa-5253479615ef', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'B',
        location: 'server/db.ts:pool-init',
        message: 'Postgres pool initialized',
        data: { ssl: env.NODE_ENV === "production" },
        timestamp: Date.now()
    })
}).catch(() => {});
// #endregion

export const db = drizzle(pgPool);