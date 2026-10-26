import { clearSessionCookie } from "@/lib/auth";
import { handleRouteError, ok } from "@/lib/http";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST() {
  try {
    await clearSessionCookie();
    return ok({ signedOut: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
