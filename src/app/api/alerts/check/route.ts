import { getDb } from "@/db";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { createIntrusionAlert, findFarmsWithinRadius } from "@/lib/queries";

export const DEFAULT_ALERT_RADIUS_KM = 3;

interface AlertCheckBody {
  animalType?: string;
  lat?: number;
  lng?: number;
  source?: string;
  severity?: string;
  radiusKm?: number;
}

/**
 * POST /api/alerts/check
 * Logs an animal / hazard sighting and returns every farm within 3 km of it.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<AlertCheckBody>(request);
    const { animalType, lat, lng } = body;

    if (!animalType || typeof animalType !== "string") {
      return fail("animalType is required.", 400);
    }

    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return fail("Valid lat and lng numbers are required.", 400);
    }

    const radiusKm =
      typeof body.radiusKm === "number" && body.radiusKm > 0
        ? body.radiusKm
        : DEFAULT_ALERT_RADIUS_KM;

    const db = getDb();

    const alert = await createIntrusionAlert(db, {
      animalType,
      lat,
      lng,
      source: body.source,
      severity: body.severity,
    });

    const affectedFarms = await findFarmsWithinRadius(db, lat, lng, radiusKm);

    return ok(
      {
        alert,
        radiusKm,
        affectedFarms,
        atRisk: affectedFarms.length > 0,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
