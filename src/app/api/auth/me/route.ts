import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer, toFarmerDTO } from "@/lib/auth";
import { handleRouteError, ok } from "@/lib/http";
import { getFarmerSetup } from "@/lib/queries";

/**
 * GET /api/auth/me
 * Returns the signed-in farmer (or `null`) plus whether onboarding is complete.
 */
export async function GET() {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return ok({ farmer: null });
    }

    const db = getDb();
    const setup = await getFarmerSetup(db, farmer.id);
    return ok({ farmer: toFarmerDTO(farmer, setup) });
  } catch (error) {
    return handleRouteError(error);
  }
}
