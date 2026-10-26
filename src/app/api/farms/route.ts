import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { isValidPoint } from "@/lib/geo";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { createFarmland, listFarmlands } from "@/lib/queries";
import type { GeoPoint } from "@/lib/types";

/**
 * GET /api/farms
 * Returns only the signed-in farmer's farms.
 */
export async function GET() {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view your farms.", 401, { code: "AUTH_REQUIRED" });
    }

    const db = getDb();
    const farms = await listFarmlands(db, farmer.id);
    return ok({ farms });
  } catch (error) {
    return handleRouteError(error);
  }
}

interface CreateFarmBody {
  name?: string;
  points?: unknown;
}

/**
 * POST /api/farms
 * Saves a farm polygon and computes its centroid + area server-side.
 * Signed-in farmers own the farm immediately. During onboarding (before the
 * account exists) the farm is stored unowned so it can be claimed in step 4.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<CreateFarmBody>(request);
    const points = Array.isArray(body.points)
      ? (body.points.filter(isValidPoint) as GeoPoint[])
      : [];

    // Drop the closing point if the client repeated the first vertex.
    if (
      points.length > 3 &&
      points[0][0] === points[points.length - 1][0] &&
      points[0][1] === points[points.length - 1][1]
    ) {
      points.pop();
    }

    if (points.length < 3) {
      return fail(
        "At least 3 valid [latitude, longitude] points are required to save a farm.",
        400,
      );
    }

    const farmer = await getSessionFarmer();
    const db = getDb();
    const farm = await createFarmland(db, {
      name: (body.name ?? "").trim() || "My Farm",
      points,
      farmerId: farmer?.id ?? null,
    });

    return ok({ farm }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
