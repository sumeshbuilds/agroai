import { connection } from "next/server";

import { withFarmer } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import {
  endCameraPeek,
  getCameraPeek,
  startCameraPeek,
} from "@/lib/camera-queries";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { parseRtcDescription } from "@/lib/security-camera";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function resolveId(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * POST /api/camera/sessions/:id/peek
 * Body: { offer: "<SDP>" }. Returns the peek id the viewer polls for an answer.
 * Video never touches the server: only SDP text is stored for 60 seconds.
 */
export async function POST(request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to start a Live Peek.", 401, { code: "AUTH_REQUIRED" });
    }

    const id = await resolveId(context);
    if (id === null) return fail("Invalid camera id.", 400);

    const body = await readJson<{ offer?: unknown }>(request);
    const offer = parseRtcDescription({ description: body.offer });
    if (!offer) return fail("Send a valid WebRTC offer.", 400);

    const result = await withFarmer(farmer.id, (db) =>
      startCameraPeek(db, id, farmer.id, offer),
    );
    if (!result) return fail("Camera not found or already stopped.", 404);

    return ok({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** GET /api/camera/sessions/:id/peek?peekId=12 — poll for the phone's answer. */
export async function GET(request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view a Live Peek.", 401, { code: "AUTH_REQUIRED" });
    }

    const id = await resolveId(context);
    if (id === null) return fail("Invalid camera id.", 400);

    const peekId = Number(new URL(request.url).searchParams.get("peekId"));
    if (!Number.isInteger(peekId) || peekId <= 0) {
      return fail("Invalid Live Peek id.", 400);
    }

    const peek = await withFarmer(farmer.id, (db) =>
      getCameraPeek(db, peekId, farmer.id),
    );
    if (!peek || peek.sessionId !== id) return fail("Live Peek not found.", 404);

    return ok({ ok: true, peek });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/camera/sessions/:id/peek?peekId=12 — stop early. */
export async function DELETE(request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to stop a Live Peek.", 401, { code: "AUTH_REQUIRED" });
    }

    const id = await resolveId(context);
    if (id === null) return fail("Invalid camera id.", 400);

    const peekId = Number(new URL(request.url).searchParams.get("peekId"));
    if (!Number.isInteger(peekId) || peekId <= 0) {
      return fail("Invalid Live Peek id.", 400);
    }

    const ended = await withFarmer(farmer.id, (db) =>
      endCameraPeek(db, peekId, farmer.id),
    );
    if (!ended) return fail("Live Peek not found.", 404);
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
