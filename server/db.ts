import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "node:process";
import pg from 'pg';

// Initialize Postgres connection
const connectionString = env.DATABASE_URL;

if (!connectionString) {
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

export const db = drizzle(pgPool);