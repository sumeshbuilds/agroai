import { connection } from "next/server";

import { withFarmer } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { getCameraAlertImage } from "@/lib/camera-queries";
import { fail, handleRouteError } from "@/lib/http";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/camera/alerts/:id/image — private evidence snapshot.
 * Signed-in owner only; never cached by a shared proxy.
 */
export async function GET(_request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view this snapshot.", 401, { code: "AUTH_REQUIRED" });
    }

    const { id } = await context.params;
    const alertId = Number(id);
    if (!Number.isInteger(alertId) || alertId <= 0) {
      return fail("Invalid snapshot id.", 400);
    }

    const dataUrl = await withFarmer(farmer.id, (db) =>
      getCameraAlertImage(db, alertId, farmer.id),
    );
    if (!dataUrl) return fail("Snapshot not found.", 404);

    const match = /^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/.exec(dataUrl);
    if (!match) return fail("Snapshot is not a supported image.", 422);

    const bytes = Buffer.from(match[2], "base64");
    return new Response(bytes, {
      headers: {
        "Content-Type": match[1],
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
