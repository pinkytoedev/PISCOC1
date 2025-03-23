import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "node:process";

// Import pg using dynamic import to work around ESM issues
const pg = await import('pg');

// Initialize Postgres connection
const connectionString = env.DATABASE_URL!;
export const pgPool = new pg.default.Pool({ connectionString });
export const db = drizzle(pgPool);