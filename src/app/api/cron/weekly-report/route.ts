import { connection, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { generateWeeklyReport, summariseWeather } from "@/lib/gemini";
import { fail, handleRouteError, ok } from "@/lib/http";
import {
  createReport,
  getCropWithFarm,
  listActiveCropsWithFarm,
  toCropDTO,
} from "@/lib/queries";
import type { Farmland } from "@/db";
import type { WeeklyReportDTO } from "@/lib/types";
import { fetchWeather } from "@/lib/weather";

/**
 * POST /api/cron/weekly-report
 * body (optional): { "cropId": 3 }
 *
 * For each active crop (or the single requested crop) this:
 *  1. Calculates the crop age in days.
 *  2. Fetches the next 7 days of weather for the farm centroid.
 *  3. Asks Gemini for a 4-bullet weekly action plan (rule-based fallback when
 *     no API key is configured).
 *  4. Saves the report and returns it for the dashboard.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return fail("Unauthorized.", 401, { code: "UNAUTHORIZED" });
    }

    const cropId = await readCropId(request);
    const result = await generateReports(cropId);
    return ok(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * GET /api/cron/weekly-report?secret=...&cropId=3
 * Convenience endpoint for schedulers (e.g. Vercel Cron) that only issue GET.
 */
export async function GET(request: NextRequest) {
  await connection();

  try {
    if (!isAuthorized(request)) {
      return fail("Unauthorized.", 401, { code: "UNAUTHORIZED" });
    }

    const cropId = await readCropId(request);
    const result = await generateReports(cropId);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;

  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const query = request.nextUrl.searchParams.get("secret");

  return bearer === secret || query === secret;
}

async function readCropId(request: NextRequest): Promise<number | undefined> {
  const fromQuery = request.nextUrl.searchParams.get("cropId");
  if (fromQuery) {
    const parsed = Number(fromQuery);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { cropId?: number };
      if (typeof body?.cropId === "number" && Number.isFinite(body.cropId)) {
        return body.cropId;
      }
    } catch {
      // No body / not JSON — fall back to all active crops.
    }
  }

  return undefined;
}

async function generateReports(cropId?: number) {
  const db = getDb();

  const targets: Array<{ cropId: number; cropName: string; growthStage: string; ageDays: number; sowingDate: string; farm: Farmland }> = [];

  if (cropId !== undefined) {
    const row = await getCropWithFarm(db, cropId);
    if (!row) {
      return { generated: [], message: `Crop ${cropId} was not found.` };
    }
    if (!row.farm) {
      return {
        generated: [],
        message:
          "This crop is not linked to a farm. Draw a farm boundary first so we can fetch local weather.",
      };
    }
    const dto = toCropDTO({ ...row.crop, farmlandName: row.farm.name });
    targets.push({
      cropId: row.crop.id,
      cropName: row.crop.cropName,
      growthStage: row.crop.growthStage ?? "Seedling",
      ageDays: dto.ageDays,
      sowingDate: dto.sowingDate.slice(0, 10),
      farm: row.farm,
    });
  } else {
    const rows = await listActiveCropsWithFarm(db);
    for (const row of rows) {
      if (!row.farm) continue;
      const dto = toCropDTO({ ...row.crop, farmlandName: row.farm.name });
      targets.push({
        cropId: row.crop.id,
        cropName: row.crop.cropName,
        growthStage: row.crop.growthStage ?? "Seedling",
        ageDays: dto.ageDays,
        sowingDate: dto.sowingDate.slice(0, 10),
        farm: row.farm,
      });
    }
  }

  if (targets.length === 0) {
    return {
      generated: [] as WeeklyReportDTO[],
      message:
        "No crops with a linked farm yet. Draw a farm boundary and add a crop first.",
    };
  }

  const generated: WeeklyReportDTO[] = [];

  for (const target of targets) {
    const weather = await fetchWeather(
      target.farm.centroidLat,
      target.farm.centroidLng,
    );

    const advisory = await generateWeeklyReport({
      cropName: target.cropName,
      growthStage: target.growthStage,
      ageDays: target.ageDays,
      sowingDate: target.sowingDate,
      weather,
    });

    const report = await createReport(
      db,
      {
        cropId: target.cropId,
        weatherSummary: summariseWeather(weather),
        aiActionPlan: advisory.actionPlan,
        cropName: target.cropName,
      },
      {
        source: advisory.source,
        model: advisory.model,
        note: advisory.note,
      },
    );

    generated.push(report);
  }

  return { generated };
}
