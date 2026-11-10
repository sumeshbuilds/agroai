import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import { deleteDiseaseScan } from "@/lib/disease-queries";
import { fail, handleRouteError, ok } from "@/lib/http";

/** DELETE /api/disease/scans/[id] — remove one of the farmer's scans. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to delete a scan.", 401, { code: "AUTH_REQUIRED" });
    }

    const { id } = await params;
    const scanId = Number(id);
    if (!Number.isInteger(scanId) || scanId <= 0) {
      return fail("That scan id is not valid.", 400);
    }

    const removed = await deleteDiseaseScan(getDb(), scanId, farmer.id);
    if (!removed) {
      return fail("That scan was not found.", 404, { code: "SCAN_NOT_FOUND" });
    }

    return ok({ removed: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
