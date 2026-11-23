import { Pool } from "@neondatabase/serverless";
import { DrizzleQueryError, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";

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

export type Database = NeonDatabase<typeof schema>;

interface DbGlobals {
  pool: Pool | null;
  db: Database | null;
}

// Next.js dev server re-evaluates modules on hot reload; keep the pool on
// `globalThis` so we do not leak a WebSocket pool per reload.
const globalForDb = globalThis as unknown as { __agroaiDb?: DbGlobals };
const globals: DbGlobals = (globalForDb.__agroaiDb ??= { pool: null, db: null });

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseNotConfiguredError();
  }

  if (!globals.db) {
    globals.pool = new Pool({ connectionString });
    globals.db = drizzle(globals.pool, { schema });
  }

  return globals.db;
}

// ---------------------------------------------------------------------------
// Row-level security scope
// ---------------------------------------------------------------------------
//
// Every tenant table enforces Postgres RLS against the `app.farmer_id` session
// setting. Because the app uses a connection pool, that setting must live
// inside a transaction: `withScope` opens one, sets the GUCs with `set_config`,
// runs the caller's queries, and commits/rolls back atomically. Without a
// scope, policies deny access by default.

export interface DbScope {
  /** The signed-in farmer; rows owned by anyone else are hidden. */
  farmerId?: number | null;
  /**
   * Farm ids this browser is allowed to read/claim while they are still
   * unowned (drawn during onboarding before an account exists).
   */
  claimFarmIds?: number[];
  /** Trusted server tasks (cron) that must span every farmer. */
  service?: boolean;
}

function claimIdsLiteral(ids: number[] | undefined): string {
  return ids && ids.length > 0 ? ids.join(",") : "";
}

/** Sets/overwrites the RLS scope on an already-open scoped database. */
export async function setScope(db: Database, scope: DbScope): Promise<void> {
  if (scope.farmerId !== undefined) {
    await db.execute(
      sql`select set_config('app.farmer_id', ${scope.farmerId === null ? "" : String(scope.farmerId)}, true)`,
    );
  }
  if (scope.claimFarmIds !== undefined) {
    await db.execute(
      sql`select set_config('app.claim_ids', ${claimIdsLiteral(scope.claimFarmIds)}, true)`,
    );
  }
  if (scope.service !== undefined) {
    await db.execute(
      sql`select set_config('app.service', ${scope.service ? "on" : ""}, true)`,
    );
  }
}

/**
 * Runs `fn` inside a transaction with the RLS scope applied. All queries issued
 * through the provided `db` see only rows the scope permits.
 */
export async function withScope<T>(
  scope: DbScope,
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const scoped = tx as unknown as Database;
    await setScope(scoped, { farmerId: null, claimFarmIds: [], service: false, ...scope });
    return fn(scoped);
  });
}

export function withFarmer<T>(
  farmerId: number,
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  return withScope({ farmerId }, fn);
}

/** Anonymous onboarding: only this browser's unowned drafts are readable. */
export function withClaim<T>(
  claimFarmIds: number[],
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  return withScope({ claimFarmIds }, fn);
}

/** Trusted server task that spans every farmer (weekly cron). */
export function withService<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  return withScope({ service: true }, fn);
}

// ---------------------------------------------------------------------------
// Error inspection
// ---------------------------------------------------------------------------

/**
 * True when the failure came from Postgres/Neon rather than application code.
 * API routes use this to show a friendly message instead of raw SQL.
 */
export function isDatabaseError(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current && depth < 6; depth += 1) {
    if (current instanceof DrizzleQueryError) return true;

    if (current instanceof Error) {
      // Structural fallback in case a bundler gives us a second copy of the
      // Drizzle classes.
      const candidate = current as Error & { query?: unknown; params?: unknown };
      if (
        typeof candidate.query === "string" &&
        Array.isArray(candidate.params)
      ) {
        return true;
      }
      if (current.name === "NeonDbError" || current.name === "PostgresError") {
        return true;
      }
      current = current.cause;
    } else {
      return false;
    }
  }

  return false;
}

/**
 * Flattens an error and its `cause` chain into one log line. Drizzle/Neon hide
 * the useful part (socket code, SQLSTATE) inside `cause`, which Next's logger
 * drops when it serializes an `Error` object.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; current && depth < 6; depth += 1) {
    if (!(current instanceof Error)) {
      parts.push(String(current));
      break;
    }

    const extra = current as Error & {
      code?: unknown;
      sourceError?: { code?: unknown };
    };
    const code = typeof extra.code === "string" ? ` (${extra.code})` : "";
    const sourceCode =
      typeof extra.sourceError?.code === "string"
        ? ` [${extra.sourceError.code}]`
        : "";
    const line = `${current.name}: ${current.message}${code}${sourceCode}`;

    if (parts[parts.length - 1] !== line) parts.push(line);
    current = current.cause;
  }

  return parts.length > 0 ? parts.join(" <- ") : "Unknown error";
}

export { schema };
export * from "./schema";
