import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { getDiseaseScanImage } from "@/lib/disease-queries";
import { fail, handleRouteError } from "@/lib/http";

/**
 * GET /api/disease/scans/[id]/image — the compressed photo, scoped to the
 * signed-in farmer. Images never change, so the browser may cache them.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view this scan.", 401, { code: "AUTH_REQUIRED" });
    }

    const { id } = await params;
    const scanId = Number(id);
    if (!Number.isInteger(scanId) || scanId <= 0) {
      return fail("That scan id is not valid.", 400);
    }

    const image = await getDiseaseScanImage(getDb(), scanId, farmer.id);
    if (!image) {
      return fail("That scan was not found.", 404, { code: "SCAN_NOT_FOUND" });
    }

    const bytes = Buffer.from(image.data, "base64");
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": image.mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
        "Vary": "Cookie",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
