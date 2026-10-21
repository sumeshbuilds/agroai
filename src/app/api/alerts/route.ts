import { connection, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { handleRouteError, ok } from "@/lib/http";
import { listAlerts } from "@/lib/queries";

/**
 * GET /api/alerts
 * GET /api/alerts?lat=20.5&lng=78.9&radiusKm=3
 *
 * Returns recent intrusion logs. When a point is supplied, every alert is
 * annotated with its distance from that point and the compass direction.
 */
export async function GET(request: NextRequest) {
  await connection();

  try {
    const params = request.nextUrl.searchParams;
    const latParam = params.get("lat");
    const lngParam = params.get("lng");
    const radiusParam = params.get("radiusKm");
    const limitParam = params.get("limit");

    const lat = latParam === null ? undefined : Number(latParam);
    const lng = lngParam === null ? undefined : Number(lngParam);
    const radiusKm = radiusParam === null ? undefined : Number(radiusParam);
    const limit = limitParam === null ? 20 : Number(limitParam);

    const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

    const db = getDb();
    const alerts = await listAlerts(db, {
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20,
      lat: hasPoint ? lat : undefined,
      lng: hasPoint ? lng : undefined,
      radiusKm:
        hasPoint && Number.isFinite(radiusKm) && radiusKm! > 0
          ? radiusKm
          : undefined,
    });

    return ok({ alerts });
  } catch (error) {
    return handleRouteError(error);
  }
}
