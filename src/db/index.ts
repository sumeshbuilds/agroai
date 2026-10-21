import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

/**
 * Thrown when `DATABASE_URL` is missing. API routes translate this into a
 * friendly 503 response instead of crashing the server.
 */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. Add your Neon Postgres connection string to .env.local and restart the server.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

export type Database = NeonHttpDatabase<typeof schema>;

let cached: Database | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseNotConfiguredError();
  }

  if (!cached) {
    cached = drizzle(neon(connectionString), { schema });
  }

  return cached;
}

export { schema };
export * from "./schema";
