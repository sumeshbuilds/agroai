import { connection } from "next/server";

import { getDb } from "@/db";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { createCrop, listCrops } from "@/lib/queries";

/** GET /api/crops — every crop with its farmland name and age in days. */
export async function GET() {
  await connection();

  try {
    const db = getDb();
    const crops = await listCrops(db);
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
}

/** POST /api/crops — register a planted crop and its sowing date. */
export async function POST(request: Request) {
  try {
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

    const db = getDb();
    const crop = await createCrop(db, {
      cropName,
      sowingDate,
      farmlandId: body.farmlandId ?? null,
      growthStage: body.growthStage,
    });

    return ok({ crop }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
