import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { parseCameraAlarmAcknowledgement, parseCameraAlarmQuery } from "@/lib/camera-alert-request";
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

    const options = parseCameraAlarmQuery(new URL(request.url).searchParams);
    if (!options) return fail("Invalid alarm cursor or dismissal filter.", 400);
    return ok(await listCameraAlerts(getDb(), farmer.id, options));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Acknowledge one alarm, or the stopped snapshot (`{ all: true, throughId }`).
 */
export async function POST(request: Request) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to update camera alarms.", 401, { code: "AUTH_REQUIRED" });
    }

    let input: unknown;
    try {
      input = await readJson<unknown>(request);
    } catch {
      return fail("Send an alarm id or a snapshot to acknowledge.", 400);
    }

    const body = parseCameraAlarmAcknowledgement(input);
    if (!body) return fail("Send a valid alarm id, or all: true with a valid throughId snapshot.", 400);
    const db = getDb();

    if (body.all === true) {
      const acknowledged = await acknowledgeAllCameraAlerts(db, farmer.id, body.throughId);
      return ok({ acknowledged, all: true });
    }

    const acknowledged = await acknowledgeCameraAlert(db, body.id, farmer.id);
    if (!acknowledged) return fail("Alarm not found.", 404);

    return ok({ acknowledged: 1, all: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
