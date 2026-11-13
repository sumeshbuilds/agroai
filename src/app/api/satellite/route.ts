import { connection, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/http";
import { getFarmland } from "@/lib/queries";
import {
  fetchSatelliteObservation,
  isSatelliteConfigured,
  SatelliteError,
  type SatelliteObservation,
} from "@/lib/satellite";

/**
 * GET /api/satellite?farmId=1
 *
 * Returns the latest usable Sentinel-2 NDVI for the field, or a structured
 * "why it is unavailable" state. A missing CDSE key is a 200 response because
 * the UI must be able to show the honest "not configured" message.
 */
export async function GET(request: NextRequest) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view satellite data.", 401, { code: "AUTH_REQUIRED" });
    }

    const farmId = Number(request.nextUrl.searchParams.get("farmId"));
    if (!Number.isInteger(farmId) || farmId <= 0) {
      return fail("A valid farmId is required.", 400);
    }

    const farm = await getFarmland(getDb(), farmId, farmer.id);
    if (!farm) return fail("Farm not found on your account.", 404);

    if (!isSatelliteConfigured()) {
      return ok({
        configured: false,
        observation: null as SatelliteObservation | null,
        unavailable: {
          code: "SATELLITE_NOT_CONFIGURED",
          message:
            "Satellite monitoring is ready but not connected. A free Copernicus Data Space client unlocks Sentinel-2 vegetation checks.",
        },
      });
    }

    try {
      const observation = await fetchSatelliteObservation({
        farmId: farm.id,
        points: farm.points,
        latitude: farm.centroidLat,
        longitude: farm.centroidLng,
      });
      return ok({
        configured: true,
        observation,
        unavailable: null,
      });
    } catch (error) {
      if (error instanceof SatelliteError) {
        return ok({
          configured: true,
          observation: null as SatelliteObservation | null,
          unavailable: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
