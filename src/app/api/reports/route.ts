import { connection, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { handleRouteError, ok } from "@/lib/http";
import { listReports } from "@/lib/queries";

/**
 * GET /api/reports?limit=10&cropId=2
 * Returns weekly AI advisory reports, newest first.
 */
export async function GET(request: NextRequest) {
  await connection();

  try {
    const params = request.nextUrl.searchParams;
    const limitParam = params.get("limit");
    const cropIdParam = params.get("cropId");

    const limit = limitParam === null ? 10 : Number(limitParam);
    const cropId = cropIdParam === null ? undefined : Number(cropIdParam);

    const db = getDb();
    const reports = await listReports(db, {
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10,
      cropId: Number.isFinite(cropId) ? cropId : undefined,
    });

    return ok({ reports });
  } catch (error) {
    return handleRouteError(error);
  }
}
