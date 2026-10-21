import { DatabaseNotConfiguredError } from "@/db";
import type { ApiError } from "./types";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function fail(
  message: string,
  status = 400,
  extra?: Partial<ApiError>,
): Response {
  return Response.json({ error: message, ...extra } satisfies ApiError, {
    status,
  });
}

/**
 * Turns any thrown value into a JSON error response. Missing database
 * configuration becomes a friendly 503 instead of a 500.
 */
export function handleRouteError(error: unknown): Response {
  if (error instanceof DatabaseNotConfiguredError) {
    return fail(error.message, 503, { code: "DB_NOT_CONFIGURED" });
  }

  if (error instanceof BadRequestError) {
    return fail(error.message, 400, { code: "BAD_REQUEST" });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error("[api] request failed:", error);
  return fail(message, 500);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
}
