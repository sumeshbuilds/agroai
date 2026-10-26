import { networkInterfaces } from "node:os";

import { connection } from "next/server";

import { getSessionFarmer } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/http";

/**
 * GET /api/camera/network
 * Local IPv4 addresses so the laptop can show a phone-reachable URL while
 * developing over the LAN (`localhost` on the laptop is not the laptop on the
 * phone). Production deployments simply use the public origin.
 */
export async function GET() {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to pair a camera.", 401, { code: "AUTH_REQUIRED" });
    }

    const addresses = Object.entries(networkInterfaces())
      .flatMap(([name, entries]) =>
        (entries ?? [])
          .filter(
            (entry) =>
              entry.family === "IPv4" && !entry.internal && entry.address,
          )
          .map((entry) => ({ address: entry.address, interface: name })),
      )
      .filter((entry) => !entry.address.startsWith("169.254."))
      .slice(0, 6);

    return ok({ addresses });
  } catch (error) {
    return handleRouteError(error);
  }
}
