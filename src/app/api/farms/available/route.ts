import { connection } from "next/server";

import { withClaim } from "@/db";
import { readClaimFarmIds } from "@/lib/claim";
import { handleRouteError, ok } from "@/lib/http";
import { listAvailableFarmlands } from "@/lib/queries";

/**
 * GET /api/farms/available
 * Farms drawn during onboarding that are still unowned *and* were created by
 * this browser (signed claim cookie). Used by the "Select your farm" step so
 * one visitor can never pick up another visitor's unclaimed field.
 */
export async function GET() {
  await connection();

  try {
    const claimFarmIds = await readClaimFarmIds();
    if (claimFarmIds.length === 0) {
      return ok({ farms: [] });
    }

    const farms = await withClaim(claimFarmIds, (db) =>
      listAvailableFarmlands(db, claimFarmIds),
    );
    return ok({ farms });
  } catch (error) {
    return handleRouteError(error);
  }
}
