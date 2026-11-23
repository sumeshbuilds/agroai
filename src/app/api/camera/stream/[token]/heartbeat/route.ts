import { eq, sql } from "drizzle-orm";
import { connection } from "next/server";

import { cameraSessions, getDb, withFarmer } from "@/db";
import type { CameraHeartbeatPayload } from "@/lib/camera";
import { recordCameraHeartbeat } from "@/lib/camera-queries";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { parseHeartbeat } from "@/lib/security-camera";

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

/**
 * POST /api/camera/stream/:token/heartbeat
 *
 * Tiny 30-second JSON heartbeat: battery level, armed/live-peek status and
 * location. It also returns a pending Live Peek offer, so the phone never needs
 * a second polling endpoint while idle. No image is uploaded here.
 */
export async function POST(request: Request, context: RouteContext) {
  await connection();

  try {
    const { token } = await context.params;
    if (!token || token.length > 64) return fail("Invalid camera link.", 400);

    const farmerId = await cameraFarmerForToken(token);
    if (farmerId === null) {
      return fail("This camera link is not valid any more.", 404);
    }

    let input: unknown = null;
    try {
      input = await readJson<CameraHeartbeatPayload>(request);
    } catch {
      input = {};
    }
    const heartbeat = parseHeartbeat(input);
    if (!heartbeat) return fail("Invalid heartbeat.", 400);

    const result = await withFarmer(farmerId, async (db) => {
      const rows = await db
        .select()
        .from(cameraSessions)
        .where(eq(cameraSessions.token, token))
        .limit(1);
      const session = rows[0];
      if (!session) return { missing: true } as const;
      if (session.status === "ended") return { stopped: true } as const;
      if (
        session.pairingExpiresAt &&
        new Date(session.pairingExpiresAt).getTime() < Date.now()
      ) {
        return { expired: true } as const;
      }

      const state = await recordCameraHeartbeat(db, session, heartbeat);
      return { state } as const;
    });

    if ("missing" in result) {
      return fail("This camera link is not valid any more.", 404);
    }
    if ("stopped" in result) {
      return fail("This camera was stopped from the dashboard.", 409, {
        code: "STREAM_STOPPED",
      });
    }
    if ("expired" in result) {
      return fail("This camera link has expired. Create a new pairing.", 410, {
        code: "PAIRING_EXPIRED",
      });
    }

    return ok({
      ok: true,
      session: result.state.session,
      peek: result.state.peek,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
