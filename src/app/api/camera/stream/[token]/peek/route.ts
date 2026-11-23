import { eq, sql } from "drizzle-orm";
import { connection } from "next/server";

import { cameraSessions, getDb, withFarmer } from "@/db";
import { answerCameraPeek, getPendingCameraPeek } from "@/lib/camera-queries";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { parseRtcDescription } from "@/lib/security-camera";

interface RouteContext {
  params: Promise<{ token: string }>;
}

async function cameraFarmerForToken(token: string): Promise<number | null> {
  const result = await getDb().execute(
    sql`select auth_camera_farmer(${token}) as farmer_id`,
  );
  const row = result.rows[0] as { farmer_id: number | null } | undefined;
  return row?.farmer_id ?? null;
}

async function tokenSession(farmerId: number, token: string) {
  return withFarmer(farmerId, async (db) => {
    const rows = await db
      .select({ id: cameraSessions.id, status: cameraSessions.status })
      .from(cameraSessions)
      .where(eq(cameraSessions.token, token))
      .limit(1);
    return rows[0] ?? null;
  });
}

/** GET /api/camera/stream/:token/peek — pending 60-second Live Peek offer. */
export async function GET(_request: Request, context: RouteContext) {
  await connection();

  try {
    const { token } = await context.params;
    if (!token || token.length > 64) return fail("Invalid camera link.", 400);

    const farmerId = await cameraFarmerForToken(token);
    if (farmerId === null) {
      return fail("This camera link is not valid any more.", 404);
    }

    const session = await tokenSession(farmerId, token);
    if (!session) return fail("This camera link is not valid any more.", 404);
    if (session.status === "ended") {
      return fail("This camera was stopped from the dashboard.", 409, {
        code: "STREAM_STOPPED",
      });
    }

    const peek = await withFarmer(farmerId, (db) =>
      getPendingCameraPeek(db, session.id),
    );
    return ok({ ok: true, peek });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/camera/stream/:token/peek — phone returns its SDP answer. */
export async function POST(request: Request, context: RouteContext) {
  await connection();

  try {
    const { token } = await context.params;
    if (!token || token.length > 64) return fail("Invalid camera link.", 400);

    const farmerId = await cameraFarmerForToken(token);
    if (farmerId === null) {
      return fail("This camera link is not valid any more.", 404);
    }

    const body = await readJson<{ id?: unknown; answer?: unknown }>(request);
    const peekId = Number(body.id);
    if (!Number.isInteger(peekId) || peekId <= 0) {
      return fail("Invalid Live Peek id.", 400);
    }
    const answer = parseRtcDescription({ description: body.answer });
    if (!answer) return fail("Invalid WebRTC answer.", 400);

    const session = await tokenSession(farmerId, token);
    if (!session) return fail("This camera link is not valid any more.", 404);

    const saved = await withFarmer(farmerId, (db) =>
      answerCameraPeek(db, session.id, peekId, answer),
    );
    if (!saved) return fail("Live Peek request expired or already answered.", 409);

    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
