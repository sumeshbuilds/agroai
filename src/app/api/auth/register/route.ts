import { getDb, withClaim } from "@/db";
import {
  getSessionFarmer,
  hashPin,
  isValidName,
  isValidPin,
  normalizeName,
  setSessionCookie,
  toFarmerDTO,
} from "@/lib/auth";
import { clearClaimFarmIds, readClaimFarmIds } from "@/lib/claim";
import { defaultDurationDays, stageNameForDay, sowingDateFromAge } from "@/lib/crop-guide";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import {
  claimFarmland,
  createCrop,
  createFarmer,
  findFarmerByName,
  isFarmClaimable,
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
 *
 * The farm must be one this browser drew during onboarding (recorded in the
 * signed claim cookie). That binding — enforced here and by row level security
 * — is what stops one visitor from claiming another visitor's unowned field.
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

    const claimFarmIds = await readClaimFarmIds();
    if (!claimFarmIds.includes(farmId)) {
      return fail(
        "That farm is no longer available. Please draw or select another farm.",
        409,
        { code: "FARM_TAKEN" },
      );
    }

    const claimable = await isFarmClaimable(db, farmId);
    if (!claimable) {
      return fail("That farm already belongs to another account. Select another farm.", 409, {
        code: "FARM_TAKEN",
      });
    }

    const ageDays = Math.round(cropDays);
    const pinHash = await hashPin(pin);

    // One transaction: create the farmer, claim the field and plant the crop.
    // If any step fails, everything rolls back and the unowned draft stays
    // available for the same browser to retry.
    const created = await withClaim(claimFarmIds, async (scoped) => {
      const farmer = await createFarmer(scoped, { name, pinHash });

      const farmClaim = await claimFarmland(scoped, farmId, farmer.id, claimFarmIds);
      if (!farmClaim) {
        return { error: "FARM_TAKEN" } as const;
      }

      const crop = await createCrop(scoped, {
        cropName,
        sowingDate: sowingDateFromAge(ageDays),
        farmlandId: farmId,
        durationDays,
        growthStage: stageNameForDay(cropName, ageDays, durationDays),
      });

      return { farmer, farm: farmClaim, crop } as const;
    });

    if ("error" in created) {
      return fail(
        "That farm was just claimed. Please select another farm.",
        409,
        { code: "FARM_TAKEN" },
      );
    }

    await setSessionCookie(created.farmer.id);
    await clearClaimFarmIds();

    return ok(
      {
        farmer: toFarmerDTO(created.farmer, { hasFarm: true, hasCrop: true }),
        farm: created.farm,
        crop: created.crop,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
