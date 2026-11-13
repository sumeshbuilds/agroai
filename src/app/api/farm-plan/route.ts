import { connection, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { assessAgroWeather } from "@/lib/agro-advisory";
import { fetchClimateSummary } from "@/lib/climate";
import { buildDailyPlan } from "@/lib/daily-tasks";
import { fail, handleRouteError, ok } from "@/lib/http";
import { assessPestRisk } from "@/lib/pest-risk";
import { getCropWithFarm, getFarmland, listCrops, toCropDTO } from "@/lib/queries";
import type { CropDTO, FarmDTO } from "@/lib/types";
import { getFieldShoppingList } from "@/lib/recommendations";
import { analyseSoil, recommendCrops, type ClimateSummary } from "@/lib/soil";
import {
  buildWeatherWarnings,
  fetchWeather,
  WeatherFetchError,
  type WeatherSnapshot,
  type WeatherWarning,
} from "@/lib/weather";

/**
 * GET /api/farm-plan?farmId=1&cropId=2
 *
 * One request for the dashboard's field-intelligence stack:
 * weather + agro work windows + pest risk + soil/crop fit + daily checklist +
 * a goal-directed Amazon list. Weather failures degrade the response instead
 * of failing the whole panel, because soil recommendations do not need a
 * forecast.
 */
export async function GET(request: NextRequest) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to load the farm plan.", 401, { code: "AUTH_REQUIRED" });
    }

    const params = request.nextUrl.searchParams;
    const farmId = Number(params.get("farmId"));
    if (!Number.isInteger(farmId) || farmId <= 0) {
      return fail("A valid farmId is required.", 400);
    }

    const db = getDb();
    const farm = await getFarmland(db, farmId, farmer.id);
    if (!farm) return fail("Farm not found on your account.", 404);

    const requestedCropId = Number(params.get("cropId"));
    let crop: CropDTO | null = null;

    if (Number.isInteger(requestedCropId) && requestedCropId > 0) {
      const row = await getCropWithFarm(db, requestedCropId, farmer.id);
      if (!row) return fail("Crop not found on your account.", 404);
      if (row.crop.farmlandId !== farmId) {
        return fail("That crop belongs to a different field.", 400);
      }
      crop = toCropDTO({
        ...row.crop,
        farmlandName: row.farm?.name ?? null,
      });
    } else {
      const crops = await listCrops(db, farmer.id);
      const farmCrops = crops.filter((entry) => entry.farmlandId === farmId);
      crop = farmCrops.find((entry) => entry.isActive) ?? farmCrops[0] ?? null;
    }

    const [weatherResult, climateResult] = await Promise.all([
      fetchWeather(farm.centroidLat, farm.centroidLng).catch(
        (error: unknown) => error,
      ),
      withTimeout(fetchClimateSummary(farm.centroidLat, farm.centroidLng), 3_000),
    ]);

    let weather: WeatherSnapshot | null = null;
    let warnings: WeatherWarning[] = [];
    let weatherError: string | null = null;

    if (weatherResult instanceof WeatherFetchError) {
      weatherError = weatherResult.message;
    } else if (weatherResult instanceof Error) {
      weatherError = "Live weather is unavailable right now.";
    } else {
      weather = weatherResult as WeatherSnapshot;
      warnings = buildWeatherWarnings(weather);
    }

    const agro = weather
      ? assessAgroWeather(
          weather,
          crop
            ? {
                cropName: crop.cropName,
                ageDays: crop.ageDays,
                durationDays: crop.durationDays,
              }
            : null,
        )
      : null;

    const pest =
      weather && crop
        ? assessPestRisk({
            cropName: crop.cropName,
            ageDays: crop.ageDays,
            durationDays: crop.durationDays,
            weather,
          })
        : null;

    const soil = analyseSoil(farm.soil);
    const climate: ClimateSummary | null = climateResult;
    const cropFit = recommendCrops({
      soil,
      climate,
      limit: 6,
      currentCrops: crop ? [crop.cropName] : [],
    });

    const dailyPlan = buildDailyPlan({
      crop: crop
        ? {
            id: crop.id,
            cropName: crop.cropName,
            ageDays: crop.ageDays,
            durationDays: crop.durationDays,
          }
        : null,
      agro,
      pest,
      soil,
    });

    const shopping = getFieldShoppingList({
      cropName: crop?.cropName ?? "your field",
      advisory: "",
      pestLevel: pest?.level ?? null,
      taskCategories: dailyPlan.tasks.map((task) => task.category),
      diseasePressure: agro?.diseasePressure.level ?? null,
      irrigationDeficitMm: agro?.irrigation.deficitMm ?? null,
      heatMaxC: agro?.heatStress.maxTemp ?? null,
      soilIssues: soil.issues.map((issue) => issue.title),
      soilPh: soil.ph,
      limit: 4,
    });

    return ok({
      farm,
      crop,
      weather,
      warnings,
      weatherError,
      agro,
      pest,
      soil,
      climate,
      cropFit,
      dailyPlan,
      shopping,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(null))
      .finally(() => clearTimeout(timer));
  });
}

/** Keeps the unused type import honest for downstream clients. */
export type FarmPlanFarm = FarmDTO;
