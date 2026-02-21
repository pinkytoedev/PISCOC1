import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "node:process";
import pg from 'pg';

// Initialize Postgres connection
const connectionString = env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
}

// Configure connection pool with Railway-friendly settings
export const pgPool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// #region agent log — H1: Pool error handler (CRITICAL: prevents crash on idle connection reset)
pgPool.on('error', (err: Error) => {
    console.error(`[db] Pool background error (non-fatal): ${err.message}`);
    fetch('http://127.0.0.1:7242/ingest/24cff41f-8e01-42f2-95fa-5253479615ef',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/db.ts:pool-error-handler',message:'Pool idle client error caught',data:{error:err.message,code:(err as any).code},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
});
// #endregion

// #region agent log — H2/H3: Log pool creation settings
fetch('http://127.0.0.1:7242/ingest/24cff41f-8e01-42f2-95fa-5253479615ef',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/db.ts:pool-init',message:'Pool initialized',data:{max:5,idleTimeout:20000,ssl:env.NODE_ENV==="production"},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
// #endregion

export const db = drizzle(pgPool);
