import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import {
  deleteCameraSession,
  getCameraSession,
  updateCameraSession,
} from "@/lib/camera-queries";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function resolveId(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** GET /api/camera/sessions/:id — session state + latest frame URL + detections. */
export async function GET(_request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view this camera.", 401, { code: "AUTH_REQUIRED" });
    }

    const id = await resolveId(context);
    if (id === null) return fail("Invalid camera id.", 400);

    const detail = await getCameraSession(getDb(), id, farmer.id);
    if (!detail) return fail("Camera not found.", 404);

    return ok(detail);
  } catch (error) {
    return handleRouteError(error);
  }
}

/** PATCH /api/camera/sessions/:id — stop, restart, or rename a camera. */
export async function PATCH(request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to update this camera.", 401, { code: "AUTH_REQUIRED" });
    }

    const id = await resolveId(context);
    if (id === null) return fail("Invalid camera id.", 400);

    const body = await readJson<{ status?: string; name?: string }>(request);
    const status =
      body.status === "ended" || body.status === "live" || body.status === "waiting"
        ? body.status
        : undefined;
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 80)
        : undefined;

    if (!status && !name) {
      return fail("Provide a status or name to update.", 400);
    }

    const session = await updateCameraSession(getDb(), id, farmer.id, {
      status,
      name,
    });
    if (!session) return fail("Camera not found.", 404);

    return ok({ session });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/camera/sessions/:id — remove the session and its detections. */
export async function DELETE(_request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to remove this camera.", 401, { code: "AUTH_REQUIRED" });
    }

    const id = await resolveId(context);
    if (id === null) return fail("Invalid camera id.", 400);

    const removed = await deleteCameraSession(getDb(), id, farmer.id);
    if (!removed) return fail("Camera not found.", 404);

    return ok({ removed: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
