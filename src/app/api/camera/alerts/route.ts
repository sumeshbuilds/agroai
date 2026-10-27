import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import {
  acknowledgeAllCameraAlerts,
  acknowledgeCameraAlert,
  listCameraAlerts,
} from "@/lib/camera-queries";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";

/**
 * GET /api/camera/alerts — unread confirmed human/animal alarms.
 * `?all=1` also returns acknowledged alarms (history).
 */
export async function GET(request: Request) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view camera alarms.", 401, { code: "AUTH_REQUIRED" });
    }

    const url = new URL(request.url);
    const includeAcknowledged = url.searchParams.get("all") === "1";
    const limit = Number(url.searchParams.get("limit") ?? 8);

    const alerts = await listCameraAlerts(getDb(), farmer.id, {
      includeAcknowledged,
      limit: Number.isFinite(limit) ? limit : 8,
    });

    return ok({ alerts, unread: alerts.filter((alert) => !alert.acknowledgedAt).length });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/camera/alerts — acknowledge one alarm (`{ id }`) or all (`{ all: true }`).
 */
export async function POST(request: Request) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to update camera alarms.", 401, { code: "AUTH_REQUIRED" });
    }

    let body: { id?: number; all?: boolean } = {};
    try {
      body = await readJson<{ id?: number; all?: boolean }>(request);
    } catch {
      // An empty body acknowledges everything.
    }

    const db = getDb();

    if (body.all || body.id === undefined) {
      const acknowledged = await acknowledgeAllCameraAlerts(db, farmer.id);
      return ok({ acknowledged, all: true });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return fail("Invalid alarm id.", 400);
    }

    const acknowledged = await acknowledgeCameraAlert(db, id, farmer.id);
    if (!acknowledged) return fail("Alarm not found.", 404);

    return ok({ acknowledged: 1, all: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
