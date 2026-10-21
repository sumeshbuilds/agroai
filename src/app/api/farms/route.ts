import { connection } from "next/server";

import { getDb } from "@/db";
import { isValidPoint } from "@/lib/geo";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { createFarmland, listFarmlands } from "@/lib/queries";
import type { GeoPoint } from "@/lib/types";

/**
 * GET /api/farms
 * Returns every saved farm. Runs at request time because it hits the database.
 */
export async function GET() {
  await connection();

  try {
    const db = getDb();
    const farms = await listFarmlands(db);
    return ok({ farms });
  } catch (error) {
    return handleRouteError(error);
  }
}

interface CreateFarmBody {
  name?: string;
  points?: unknown;
  farmerId?: number;
}

/**
 * POST /api/farms
 * Saves a farm polygon and computes its centroid + area server-side.
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

    const db = getDb();
    const farm = await createFarmland(db, {
      name: (body.name ?? "").trim() || "My Farm",
      points,
      farmerId: body.farmerId,
    });

    return ok({ farm }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
