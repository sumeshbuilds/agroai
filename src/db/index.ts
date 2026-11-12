import { neon, neonConfig } from "@neondatabase/serverless";
import { DrizzleQueryError } from "drizzle-orm";
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
    installRetryingFetch();
    cached = drizzle(neon(connectionString), { schema });
  }

  return cached;
}

// ---------------------------------------------------------------------------
// Transient connection retries
// ---------------------------------------------------------------------------
//
// The Neon HTTP driver sends every query over `fetch`. A long-lived Next.js
// process can pick up a keep-alive socket that the proxy has already closed, or
// lose the connection while the compute wakes up. Those requests fail with an
// opaque "Failed query: ..." wrapper even though the query itself is valid and
// an immediate retry succeeds.
//
// Only read-only statements are retried: replaying an INSERT/UPDATE after a
// dropped response could duplicate a write.

const READ_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [150, 400];

const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

const TRANSIENT_MESSAGE =
  /fetch failed|socket hang up|other side closed|network connection|connection terminated/i;

/** SQL that must never be replayed automatically. */
const MUTATING_SQL =
  /\b(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke|comment on|copy)\b/;

interface NeonQueryPayload {
  query?: unknown;
  queries?: { query?: unknown }[];
}

const fetchImpl = globalThis.fetch.bind(globalThis);

let retryFetchInstalled = false;

function installRetryingFetch(): void {
  if (retryFetchInstalled) return;
  retryFetchInstalled = true;

  neonConfig.fetchFunction = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const attempts = isReadOnlyRequest(init) ? READ_ATTEMPTS : 1;

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fetchImpl(input, init);
      } catch (error) {
        if (attempt >= attempts || !isTransientFetchError(error)) throw error;
        await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 400);
      }
    }
  };
}

function isReadOnlyRequest(init?: RequestInit): boolean {
  // The driver always sends a JSON string body; anything else is not ours.
  if (typeof init?.body !== "string") return false;

  let payload: NeonQueryPayload;
  try {
    payload = JSON.parse(init.body) as NeonQueryPayload;
  } catch {
    return false;
  }

  const statements = Array.isArray(payload.queries)
    ? payload.queries
    : [payload];
  return (
    statements.length > 0 &&
    statements.every((statement) => isReadOnlyStatement(statement?.query))
  );
}

function isReadOnlyStatement(query: unknown): boolean {
  if (typeof query !== "string") return false;

  const sql = query.trimStart().toLowerCase();
  const reads =
    sql.startsWith("select") ||
    sql.startsWith("with") ||
    sql.startsWith("show") ||
    sql.startsWith("explain") ||
    sql.startsWith("values");

  // A `with` CTE can still contain a write, so check the whole statement.
  return reads && !MUTATING_SQL.test(sql);
}

function isTransientFetchError(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current && depth < 5; depth += 1) {
    if (!(current instanceof Error)) return false;

    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && RETRYABLE_NETWORK_CODES.has(code)) {
      return true;
    }
    if (TRANSIENT_MESSAGE.test(current.message)) return true;

    current = current.cause;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
