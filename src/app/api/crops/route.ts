import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { defaultDurationDays, stageNameForDay } from "@/lib/crop-guide";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { createCrop, getFarmland, listCrops } from "@/lib/queries";

const MS_PER_DAY = 86_400_000;

/** GET /api/crops — the signed-in farmer's crops, newest first. */
export async function GET() {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view your crops.", 401, { code: "AUTH_REQUIRED" });
    }

    const db = getDb();
    const crops = await listCrops(db, farmer.id);
    return ok({ crops });
  } catch (error) {
    return handleRouteError(error);
  }
}

interface CreateCropBody {
  cropName?: string;
  sowingDate?: string;
  farmlandId?: number | null;
  growthStage?: string;
  durationDays?: number;
}

/** POST /api/crops — register a planted crop on one of the farmer's farms. */
export async function POST(request: Request) {
  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to add a crop.", 401, { code: "AUTH_REQUIRED" });
    }

    const body = await readJson<CreateCropBody>(request);
    const cropName = (body.cropName ?? "").trim();

    if (!cropName) {
      return fail("cropName is required.", 400);
    }

    if (!body.sowingDate) {
      return fail("sowingDate is required (YYYY-MM-DD).", 400);
    }

    const sowingDate = new Date(body.sowingDate);
    if (Number.isNaN(sowingDate.getTime())) {
      return fail("sowingDate must be a valid date (YYYY-MM-DD).", 400);
    }

    if (typeof body.farmlandId !== "number") {
      return fail("Select one of your farms for this crop.", 400);
    }

    const db = getDb();
    const farm = await getFarmland(db, body.farmlandId, farmer.id);
    if (!farm) {
      return fail("That farm was not found on your account.", 404, {
        code: "FARM_NOT_FOUND",
      });
    }

    const durationDays =
      typeof body.durationDays === "number" &&
      Number.isFinite(body.durationDays) &&
      body.durationDays > 0
        ? Math.round(body.durationDays)
        : defaultDurationDays(cropName);

    const ageDays = Math.max(
      0,
      Math.floor((Date.now() - sowingDate.getTime()) / MS_PER_DAY),
    );

    const crop = await createCrop(db, {
      cropName,
      sowingDate,
      farmlandId: farm.id,
      durationDays,
      growthStage:
        body.growthStage?.trim() || stageNameForDay(cropName, ageDays, durationDays),
    });

    return ok({ crop }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
