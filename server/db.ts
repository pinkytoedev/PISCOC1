import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "node:process";

// Initialize Postgres connection
const connectionString = env.DATABASE_URL!;
export const client = postgres(connectionString);
export const db = drizzle(client);