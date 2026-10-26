import { connection, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/http";
import { assessPestRisk } from "@/lib/pest-risk";
import {
  getCropWithFarm,
  listActiveCropsWithFarm,
  toCropDTO,
} from "@/lib/queries";
import { fetchWeather, WeatherFetchError } from "@/lib/weather";

/**
 * GET /api/pest-risk?cropId=3
 *
 * Analyses the farmer's crop stage together with the live 7-day forecast and
 * returns a transparent pest-risk assessment. When `cropId` is omitted the
 * newest active crop is used.
 */
export async function GET(request: NextRequest) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to analyse pest risk.", 401, { code: "AUTH_REQUIRED" });
    }

    const db = getDb();
    const cropIdParam = request.nextUrl.searchParams.get("cropId");

    let row: Awaited<ReturnType<typeof getCropWithFarm>> = null;

    if (cropIdParam !== null) {
      const cropId = Number(cropIdParam);
      if (!Number.isFinite(cropId)) {
        return fail("cropId must be a number.", 400);
      }
      row = await getCropWithFarm(db, cropId, farmer.id);
    } else {
      const active = await listActiveCropsWithFarm(db, farmer.id);
      row = active[0] ?? null;
    }

    if (!row) {
      return fail(
        "No crop found on your account. Add a crop first so we can analyse it.",
        404,
        { code: "CROP_NOT_FOUND" },
      );
    }

    if (!row.farm) {
      return fail(
        "This crop is not linked to a farm, so weather cannot be fetched.",
        400,
        { code: "FARM_MISSING" },
      );
    }

    const crop = toCropDTO({ ...row.crop, farmlandName: row.farm.name });
    const weather = await fetchWeather(row.farm.centroidLat, row.farm.centroidLng);

    const assessment = assessPestRisk({
      cropName: row.crop.cropName,
      ageDays: crop.ageDays,
      durationDays: crop.durationDays,
      weather,
    });

    return ok({
      crop,
      farmName: row.farm.name,
      assessment,
    });
  } catch (error) {
    if (error instanceof WeatherFetchError) {
      return fail(error.message, 502, { code: "WEATHER_UPSTREAM" });
    }
    return handleRouteError(error);
  }
}
