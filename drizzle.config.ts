import type { Config } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default {
  out: "./migrations",
  schema: "./shared/schema.ts",
  connectionString: process.env.DATABASE_URL!,
} satisfies Config;
