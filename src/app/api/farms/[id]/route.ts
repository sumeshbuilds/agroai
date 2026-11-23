import { connection } from "next/server";

import { withFarmer } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { deleteFarmlandDeep, renameFarmland } from "@/lib/queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function resolveId(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * PATCH /api/farms/:id — rename one of the signed-in farmer's fields.
 */
export async function PATCH(request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to rename your field.", 401, { code: "AUTH_REQUIRED" });
    }

    const farmId = await resolveId(context);
    if (farmId === null) return fail("Invalid farm id.", 400);

    const body = await readJson<{ name?: string }>(request);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (name.length === 0) {
      return fail("Enter a name for this field.", 400);
    }

    const farm = await withFarmer(farmer.id, (db) =>
      renameFarmland(db, farmId, farmer.id, name),
    );
    if (!farm) return fail("Farm not found on your account.", 404);

    return ok({ farm });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/farms/:id — removes a field and the crops/reports on it.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to remove a field.", 401, { code: "AUTH_REQUIRED" });
    }

    const farmId = await resolveId(context);
    if (farmId === null) return fail("Invalid farm id.", 400);

    const removed = await withFarmer(farmer.id, (db) =>
      deleteFarmlandDeep(db, farmId, farmer.id),
    );
    if (!removed) return fail("Farm not found on your account.", 404);

    return ok({ removed: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
