import { connection } from "next/server";

import { getDb } from "@/db";
import { handleRouteError, ok } from "@/lib/http";
import { listAvailableFarmlands } from "@/lib/queries";

/**
 * GET /api/farms/available
 * Farms drawn during onboarding that are not yet linked to an account.
 * Used by the "Select your farm" step.
 */
export async function GET() {
  await connection();

  try {
    const db = getDb();
    const farms = await listAvailableFarmlands(db);
    return ok({ farms });
  } catch (error) {
    return handleRouteError(error);
  }
}
