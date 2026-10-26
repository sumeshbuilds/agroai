import { connection, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/http";
import { getFarmland } from "@/lib/queries";
import { buildWeatherWarnings, fetchWeather, WeatherFetchError } from "@/lib/weather";

/**
 * GET /api/weather?farmId=1
 * GET /api/weather?lat=20.5&lng=78.9
 * Proxies Open-Meteo and adds agricultural warnings.
 */
export async function GET(request: NextRequest) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view weather.", 401, { code: "AUTH_REQUIRED" });
    }

    const params = request.nextUrl.searchParams;
    const farmId = params.get("farmId");

    let latitude: number | undefined;
    let longitude: number | undefined;
    let farmName: string | null = null;

    if (farmId) {
      const db = getDb();
      const farm = await getFarmland(db, Number(farmId), farmer.id);
      if (!farm) return fail(`Farm ${farmId} was not found on your account.`, 404);
      latitude = farm.centroidLat;
      longitude = farm.centroidLng;
      farmName = farm.name;
    } else {
      const latParam = params.get("lat");
      const lngParam = params.get("lng");
      latitude = latParam === null ? undefined : Number(latParam);
      longitude = lngParam === null ? undefined : Number(lngParam);
    }

    if (
      latitude === undefined ||
      longitude === undefined ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return fail(
        "Provide either farmId, or valid lat and lng query parameters.",
        400,
      );
    }

    const weather = await fetchWeather(latitude, longitude);

    return ok({
      farmName,
      weather,
      warnings: buildWeatherWarnings(weather),
    });
  } catch (error) {
    if (error instanceof WeatherFetchError) {
      return fail(error.message, 502, { code: "WEATHER_UPSTREAM" });
    }
    return handleRouteError(error);
  }
}
