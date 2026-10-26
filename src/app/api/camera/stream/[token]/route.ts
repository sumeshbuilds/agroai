import { eq } from "drizzle-orm";
import { connection } from "next/server";

import { cameraSessions, getDb } from "@/db";
import type { CameraIngestPayload } from "@/lib/camera";
import {
  getCameraSessionByToken,
  ingestCameraFrame,
} from "@/lib/camera-queries";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";

interface RouteContext {
  params: Promise<{ token: string }>;
}

const MAX_FRAME_CHARS = 900_000; // ~650 KB of base64 image data
const VALID_FRAME_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/webp;base64,",
];

/** GET /api/camera/stream/:token — pairing info for the phone page. */
export async function GET(_request: Request, context: RouteContext) {
  await connection();

  try {
    const { token } = await context.params;
    if (!token || token.length > 64) return fail("Invalid camera link.", 400);

    const detail = await getCameraSessionByToken(getDb(), token);
    if (!detail) return fail("This camera link is not valid any more.", 404);

    return ok(detail);
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/camera/stream/:token
 * Receives a JPEG frame + on-device detections from the phone. The random
 * token identifies the session, so the phone does not need a login cookie.
 */
export async function POST(request: Request, context: RouteContext) {
  await connection();

  try {
    const { token } = await context.params;
    if (!token || token.length > 64) return fail("Invalid camera link.", 400);

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_FRAME_CHARS + 20_000) {
      return fail("Frame is too large. Send a smaller JPEG.", 413);
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(cameraSessions)
      .where(eq(cameraSessions.token, token))
      .limit(1);

    const session = rows[0];
    if (!session) return fail("This camera link is not valid any more.", 404);

    if (session.status === "ended") {
      return fail("This stream was stopped from the dashboard.", 409, {
        code: "STREAM_STOPPED",
      });
    }

    const body = await readJson<CameraIngestPayload>(request);
    const frame = body.frame;

    if (
      typeof frame !== "string" ||
      !VALID_FRAME_PREFIXES.some((prefix) => frame.startsWith(prefix))
    ) {
      return fail("frame must be a JPEG data URL.", 400);
    }

    if (frame.length > MAX_FRAME_CHARS) {
      return fail("Frame is too large. Send a smaller JPEG.", 413);
    }

    if (body.detections !== undefined && !Array.isArray(body.detections)) {
      return fail("detections must be an array.", 400);
    }

    const result = await ingestCameraFrame(db, session, {
      ...body,
      frame,
      detections: Array.isArray(body.detections) ? body.detections.slice(0, 24) : [],
    });

    return ok({
      ok: true,
      sessionId: result.session.id,
      frameUpdatedAt: result.session.frameUpdatedAt,
      newDetections: result.newDetections,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
