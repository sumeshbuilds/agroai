import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { getFarmland, updateFarmSoil } from "@/lib/queries";
import { analyseSoil, normalizeSoilInput } from "@/lib/soil";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function resolveId(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * GET /api/farms/:id/soil
 * Returns the saved soil test plus its derived ratings and issues.
 */
export async function GET(_request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view soil data.", 401, { code: "AUTH_REQUIRED" });
    }

    const farmId = await resolveId(context);
    if (farmId === null) return fail("Invalid farm id.", 400);

    const farm = await getFarmland(getDb(), farmId, farmer.id);
    if (!farm) return fail("Farm not found on your account.", 404);

    return ok({ soil: analyseSoil(farm.soil), raw: farm.soil ?? null });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/farms/:id/soil
 * Saves the values printed on the farmer's Soil Health Card. All fields are
 * optional, but at least one meaningful value must be present.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to save soil data.", 401, { code: "AUTH_REQUIRED" });
    }

    const farmId = await resolveId(context);
    if (farmId === null) return fail("Invalid farm id.", 400);

    const db = getDb();
    const farm = await getFarmland(db, farmId, farmer.id);
    if (!farm) return fail("Farm not found on your account.", 404);

    const body = await readJson<unknown>(request);
    const soil = normalizeSoilInput(body);

    const hasValue = [
      soil.ph,
      soil.ec,
      soil.organicCarbon,
      soil.nitrogen,
      soil.phosphorus,
      soil.potassium,
      soil.sandPct,
      soil.clayPct,
      soil.texture,
    ].some((value) => value !== null && value !== undefined);

    if (!hasValue) {
      return fail(
        "Enter at least one soil value (pH, organic carbon, N, P, K or texture) from the Soil Health Card.",
        400,
        { code: "SOIL_EMPTY" },
      );
    }

    const testedAt = soil.testedAt ? new Date(soil.testedAt) : null;
    const validTestedAt =
      testedAt && !Number.isNaN(testedAt.getTime()) ? testedAt : null;

    const updated = await updateFarmSoil(db, farmId, farmer.id, {
      ph: soil.ph ?? null,
      ec: soil.ec ?? null,
      organicCarbon: soil.organicCarbon ?? null,
      nitrogen: soil.nitrogen ?? null,
      phosphorus: soil.phosphorus ?? null,
      potassium: soil.potassium ?? null,
      sandPct: soil.sandPct ?? null,
      clayPct: soil.clayPct ?? null,
      siltPct: soil.siltPct ?? null,
      texture: soil.texture ?? null,
      testedAt: validTestedAt,
    });

    if (!updated) return fail("Could not save the soil values.", 500);

    return ok({
      farm: updated,
      soil: analyseSoil(updated.soil),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
