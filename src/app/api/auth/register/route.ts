import { getDb } from "@/db";
import {
  getSessionFarmer,
  hashPin,
  isValidName,
  isValidPin,
  normalizeName,
  setSessionCookie,
  toFarmerDTO,
} from "@/lib/auth";
import { defaultDurationDays, stageNameForDay, sowingDateFromAge } from "@/lib/crop-guide";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import {
  claimFarmland,
  createCrop,
  createFarmer,
  deleteFarmerById,
  findFarmerByName,
  getFarmerById,
  getFarmland,
  releaseFarmland,
} from "@/lib/queries";

interface RegisterBody {
  name?: string;
  pin?: string;
  farmId?: number;
  cropName?: string;
  cropDays?: number;
  durationDays?: number;
}

const MAX_CROP_DAYS = 400;
const MAX_DURATION_DAYS = 400;

/**
 * POST /api/auth/register
 * Completes the 4-step onboarding: farmer profile, farm, crop and PIN.
 */
export async function POST(request: Request) {
  try {
    const existingSession = await getSessionFarmer();
    if (existingSession) {
      return fail("You are already signed in. Sign out before creating another account.", 409, {
        code: "ALREADY_SIGNED_IN",
      });
    }

    const body = await readJson<RegisterBody>(request);

    const name = normalizeName(body.name ?? "");
    const pin = (body.pin ?? "").trim();
    const cropName = (body.cropName ?? "").trim();
    const farmId = body.farmId;
    const cropDays = body.cropDays;
    const durationDays =
      typeof body.durationDays === "number" && Number.isFinite(body.durationDays)
        ? Math.round(body.durationDays)
        : defaultDurationDays(cropName);

    if (!isValidName(name)) {
      return fail("Enter a name between 2 and 60 characters.", 400);
    }
    if (!isValidPin(pin)) {
      return fail("PIN must be 4–32 letters or numbers (for example name1234).", 400);
    }
    if (typeof farmId !== "number" || !Number.isInteger(farmId) || farmId <= 0) {
      return fail("Select a farm before finishing onboarding.", 400);
    }
    if (!cropName) {
      return fail("Select the crop you planted.", 400);
    }
    if (
      typeof cropDays !== "number" ||
      !Number.isFinite(cropDays) ||
      cropDays < 0 ||
      cropDays > MAX_CROP_DAYS
    ) {
      return fail(`Enter the crop day between 0 and ${MAX_CROP_DAYS}.`, 400);
    }
    if (durationDays < 1 || durationDays > MAX_DURATION_DAYS) {
      return fail(`Crop duration must be between 1 and ${MAX_DURATION_DAYS} days.`, 400);
    }

    const db = getDb();

    const duplicate = await findFarmerByName(db, name);
    if (duplicate) {
      return fail(
        "That name is already registered. Choose another name or sign in instead.",
        409,
        { code: "NAME_TAKEN" },
      );
    }

    const farm = await getFarmland(db, farmId);
    if (!farm) {
      return fail("That farm no longer exists. Draw or select another farm.", 404);
    }
    if (farm.farmerId !== null) {
      const owner = await getFarmerById(db, farm.farmerId);
      if (owner?.pinHash) {
        return fail("That farm already belongs to another account. Select another farm.", 409, {
          code: "FARM_TAKEN",
        });
      }
    }

    const ageDays = Math.round(cropDays);
    const pinHash = await hashPin(pin);
    const farmer = await createFarmer(db, { name, pinHash });

    let claimed = false;
    try {
      const farmClaim = await claimFarmland(db, farm.id, farmer.id);
      if (!farmClaim) {
        await deleteFarmerById(db, farmer.id);
        return fail(
          "That farm was just claimed by someone else. Please select another farm.",
          409,
          { code: "FARM_TAKEN" },
        );
      }
      claimed = true;

      const crop = await createCrop(db, {
        cropName,
        sowingDate: sowingDateFromAge(ageDays),
        farmlandId: farm.id,
        durationDays,
        growthStage: stageNameForDay(cropName, ageDays, durationDays),
      });

      await setSessionCookie(farmer.id);

      return ok(
        {
          farmer: toFarmerDTO(farmer, { hasFarm: true, hasCrop: true }),
          farm: farmClaim,
          crop,
        },
        { status: 201 },
      );
    } catch (cause) {
      if (claimed) {
        await releaseFarmland(db, farm.id, farmer.id).catch(() => undefined);
      }
      await deleteFarmerById(db, farmer.id).catch(() => undefined);
      throw cause;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
