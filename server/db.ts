import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "node:process";
import pg from 'pg';

// Initialize Postgres connection
const connectionString = env.DATABASE_URL!;
export const pgPool = new pg.Pool({ connectionString });
export const db = drizzle(pgPool);