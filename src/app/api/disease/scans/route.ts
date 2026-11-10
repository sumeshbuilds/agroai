import { connection } from "next/server";

import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { listDiseaseScans } from "@/lib/disease-queries";
import { fail, handleRouteError, ok } from "@/lib/http";

/** GET /api/disease/scans?limit=18&before=123 — the farmer's scan history. */
export async function GET(request: Request) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to view your scans.", 401, { code: "AUTH_REQUIRED" });
    }

    const params = new URL(request.url).searchParams;
    const limitRaw = Number(params.get("limit"));
    const beforeRaw = Number(params.get("before"));

    const scans = await listDiseaseScans(getDb(), farmer.id, {
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
      beforeId:
        Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined,
    });

    return ok({ scans });
  } catch (error) {
    return handleRouteError(error);
  }
}
