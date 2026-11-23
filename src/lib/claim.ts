import { cookies } from "next/headers";

import { signValue, verifySignedValue } from "./auth";

/**
 * Anonymous onboarding claim cookie.
 *
 * A visitor can draw a field boundary on the map before creating an account.
 * That farm is stored unowned so it can be attached in the final onboarding
 * step. The cookie records the ids *this browser* created, so the "select your
 * farm" list and the claim step can only ever touch this visitor's own drafts —
 * never another visitor's unowned farm.
 *
 * The value is `<id>.<id>...` signed with the session secret, so it cannot be
 * forged to claim someone else's farm.
 */
export const CLAIM_COOKIE = "agroai_claim";
const CLAIM_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_CLAIM_IDS = 25;

function parseClaimValue(value: string | undefined): number[] {
  if (!value) return [];
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return [];

  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!verifySignedValue(payload, signature)) return [];

  const ids: number[] = [];
  for (const part of payload.split(".")) {
    const id = Number(part);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }
  return ids.slice(-MAX_CLAIM_IDS);
}

function serializeClaimValue(ids: number[]): string {
  const payload = ids.slice(-MAX_CLAIM_IDS).join(".");
  return `${payload}.${signValue(payload)}`;
}

/** Farm ids this browser may still see/claim while they are unowned. */
export async function readClaimFarmIds(): Promise<number[]> {
  const store = await cookies();
  return parseClaimValue(store.get(CLAIM_COOKIE)?.value);
}

/** Records a newly drawn, still-unowned farm against this browser. */
export async function addClaimFarmId(id: number): Promise<void> {
  const current = await readClaimFarmIds();
  const next = [...current.filter((existing) => existing !== id), id];
  const store = await cookies();
  store.set(CLAIM_COOKIE, serializeClaimValue(next), claimCookieOptions());
}

/** Clears the pending drafts once they have been attached to an account. */
export async function clearClaimFarmIds(): Promise<void> {
  const store = await cookies();
  store.set(CLAIM_COOKIE, "", { ...claimCookieOptions(), maxAge: 0 });
}

function claimCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.AUTH_COOKIE_SECURE !== "false",
    path: "/",
    maxAge: CLAIM_MAX_AGE_SECONDS,
  };
}
