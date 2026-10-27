import { eq } from "drizzle-orm";
import { after, connection } from "next/server";

import { cameraSessions, getDb } from "@/db";
import type { CameraIngestPayload } from "@/lib/camera";
import {
  getCameraSessionByToken,
  ingestCameraFrame,
  verifyCameraDetections,
} from "@/lib/camera-queries";
import { isGroqConfigured } from "@/lib/groq";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";

interface RouteContext {
  params: Promise<{ token: string }>;
}

const MAX_FRAME_CHARS = 900_000; // ~650 KB of base64 image data
const MAX_FRAME_BYTES = 650_000;
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
 * Reads either the legacy JSON body (`{ frame: dataUrl, … }`) or the
 * bandwidth-friendly multipart body (`meta` JSON + raw JPEG `frame` blob).
 * Multipart avoids the ~33% base64 overhead on the phone's mobile data.
 */
async function readIngest(
  request: Request,
): Promise<{ body: CameraIngestPayload } | { error: Response }> {
  const contentType = request.headers.get("content-type") ?? "";
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FRAME_CHARS + 20_000) {
    return { error: fail("Frame is too large. Send a smaller JPEG.", 413) };
  }

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { error: fail("Could not read the uploaded frame.", 400) };
    }

    const framePart = form.get("frame");
    const metaPart = form.get("meta");

    if (!(framePart instanceof Blob)) {
      return { error: fail("frame must be a JPEG file.", 400) };
    }
    if (framePart.size > MAX_FRAME_BYTES) {
      return { error: fail("Frame is too large. Send a smaller JPEG.", 413) };
    }

    let meta: Partial<CameraIngestPayload> = {};
    if (typeof metaPart === "string" && metaPart.trim()) {
      try {
        meta = JSON.parse(metaPart) as Partial<CameraIngestPayload>;
      } catch {
        return { error: fail("meta must be valid JSON.", 400) };
      }
    }

    if (meta.detections !== undefined && !Array.isArray(meta.detections)) {
      return { error: fail("detections must be an array.", 400) };
    }

    const mime = framePart.type === "image/webp" ? "image/webp" : "image/jpeg";
    const frame = `data:${mime};base64,${Buffer.from(
      await framePart.arrayBuffer(),
    ).toString("base64")}`;

    return { body: { ...meta, frame, detections: meta.detections ?? [] } };
  }

  const body = await readJson<CameraIngestPayload>(request);
  const frame = body.frame;

  if (
    typeof frame !== "string" ||
    !VALID_FRAME_PREFIXES.some((prefix) => frame.startsWith(prefix))
  ) {
    return { error: fail("frame must be a JPEG data URL.", 400) };
  }

  if (frame.length > MAX_FRAME_CHARS) {
    return { error: fail("Frame is too large. Send a smaller JPEG.", 413) };
  }

  if (body.detections !== undefined && !Array.isArray(body.detections)) {
    return { error: fail("detections must be an array.", 400) };
  }

  return { body: { ...body, frame } };
}

/**
 * POST /api/camera/stream/:token
 * Receives a JPEG frame + on-device detections from the phone. The random
 * token identifies the session, so the phone does not need a login cookie.
 *
 * Ingest responds immediately. When a new human/animal track is logged and
 * Groq is configured, vision verification runs in `after()` so it never adds
 * latency to the live frame path.
 */
export async function POST(request: Request, context: RouteContext) {
  await connection();

  try {
    const { token } = await context.params;
    if (!token || token.length > 64) return fail("Invalid camera link.", 400);

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

    const parsed = await readIngest(request);
    if ("error" in parsed) return parsed.error;

    const body = parsed.body;
    const result = await ingestCameraFrame(db, session, {
      ...body,
      detections: Array.isArray(body.detections)
        ? body.detections.slice(0, 12)
        : [],
    });

    const verification = result.verification;
    if (verification && isGroqConfigured()) {
      after(async () => {
        try {
          await verifyCameraDetections(
            getDb(),
            result.session.id,
            verification.ids,
            verification.frame,
          );
        } catch (error) {
          console.warn("[camera] Groq verification failed:", error);
        }
      });
    }

    return ok({
      ok: true,
      sessionId: result.session.id,
      frameUpdatedAt: result.session.frameUpdatedAt,
      newDetections: result.newDetections,
      newAlerts: result.newAlerts,
      verificationQueued: Boolean(verification && isGroqConfigured()),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
