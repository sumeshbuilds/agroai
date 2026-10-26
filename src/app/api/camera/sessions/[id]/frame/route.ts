import { and, eq } from "drizzle-orm";
import { connection } from "next/server";

import { cameraSessions, getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { fail, handleRouteError } from "@/lib/http";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/camera/sessions/:id/frame
 * Serves the latest JPEG from a camera owned by the signed-in farmer.
 * The `v` cache-buster changes with every uploaded frame.
 */
export async function GET(_request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view this camera.", 401, { code: "AUTH_REQUIRED" });
    }

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return fail("Invalid camera id.", 400);

    const rows = await getDb()
      .select({
        frame: cameraSessions.latestFrame,
        frameUpdatedAt: cameraSessions.frameUpdatedAt,
      })
      .from(cameraSessions)
      .where(
        and(
          eq(cameraSessions.id, id),
          eq(cameraSessions.farmerId, farmer.id),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row?.frame) return fail("No frame received yet.", 404);

    const base64 = row.frame.includes(",")
      ? row.frame.slice(row.frame.indexOf(",") + 1)
      : row.frame;

    const bytes = Buffer.from(base64, "base64");
    if (bytes.length === 0) return fail("Stored frame is empty.", 404);

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        // The URL includes ?v=<frame timestamp>, so immutable is safe and
        // avoids re-downloading identical frames while the dashboard polls.
        "Cache-Control": "private, max-age=60, immutable",
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
