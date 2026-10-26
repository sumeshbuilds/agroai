import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { createCameraSession, listCameraSessions } from "@/lib/camera-queries";
import { BadRequestError, fail, handleRouteError, ok, readJson } from "@/lib/http";

/**
 * GET /api/camera/sessions — the signed-in farmer's camera sessions.
 * POST /api/camera/sessions — creates a pairing token for a phone camera.
 */
export async function GET() {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view your cameras.", 401, { code: "AUTH_REQUIRED" });
    }

    const sessions = await listCameraSessions(getDb(), farmer.id);
    return ok({ sessions });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to add a camera.", 401, { code: "AUTH_REQUIRED" });
    }

    let body: { name?: string } = {};
    try {
      body = await readJson<{ name?: string }>(request);
    } catch {
      // An empty body is fine — a default name is used.
    }

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 80)
        : "Field camera";

    if (name.length < 2) {
      throw new BadRequestError("Give the camera a name of at least 2 characters.");
    }

    const session = await createCameraSession(getDb(), farmer.id, name);
    return ok({ session }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
