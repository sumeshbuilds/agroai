import { connection } from "next/server";

import { setScope, withClaim, withFarmer } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { addClaimFarmId, readClaimFarmIds } from "@/lib/claim";
import { isValidPoint } from "@/lib/geo";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { createFarmland, listFarmlands, nextFarmlandId } from "@/lib/queries";
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

    return withFarmer(farmer.id, async (db) =>
      ok({ farms: await listFarmlands(db, farmer.id) }),
    );
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
 * account exists) the farm is stored unowned but bound to this browser with a
 * signed claim cookie, so only the visitor who drew it can see or claim it.
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

    const name = (body.name ?? "").trim() || "My Farm";
    const farmer = await getSessionFarmer();

    if (farmer) {
      const farm = await withFarmer(farmer.id, (db) =>
        createFarmland(db, { name, points, farmerId: farmer.id }),
      );
      return ok({ farm }, { status: 201 });
    }

    // Anonymous onboarding draft, scoped to this browser's claim cookie.
    const claimIds = await readClaimFarmIds();
    const farm = await withClaim(claimIds, async (db) => {
      const id = await nextFarmlandId(db);
      await setScope(db, { claimFarmIds: [...claimIds, id] });
      return createFarmland(db, { id, name, points, farmerId: null });
    });
    await addClaimFarmId(farm.id);

    return ok({ farm }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
