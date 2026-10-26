import { getDb } from "@/db";
import {
  isValidPin,
  normalizeName,
  setSessionCookie,
  toFarmerDTO,
  verifyPin,
} from "@/lib/auth";
import { fail, handleRouteError, ok, readJson } from "@/lib/http";
import { findFarmerByName, getFarmerSetup } from "@/lib/queries";

interface LoginBody {
  name?: string;
  pin?: string;
}

/** POST /api/auth/login — name + PIN session login. */
export async function POST(request: Request) {
  try {
    const body = await readJson<LoginBody>(request);
    const name = normalizeName(body.name ?? "");
    const pin = (body.pin ?? "").trim();

    if (!name || !isValidPin(pin)) {
      return fail("Enter your name and PIN.", 400);
    }

    const db = getDb();
    const farmer = await findFarmerByName(db, name);
    const valid = farmer ? await verifyPin(pin, farmer.pinHash) : false;

    if (!farmer || !valid) {
      return fail("Name or PIN is incorrect.", 401, { code: "INVALID_CREDENTIALS" });
    }

    await setSessionCookie(farmer.id);
    const setup = await getFarmerSetup(db, farmer.id);

    return ok({ farmer: toFarmerDTO(farmer, setup) });
  } catch (error) {
    return handleRouteError(error);
  }
}
