import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { farmers, getDb, type Farmer } from "@/db";
import type { FarmerDTO } from "./types";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const PIN_PREFIX = "scrypt";
const PIN_KEY_LENGTH = 64;

export const SESSION_COOKIE = "agroai_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) return secret;

  // Keeps local development working without extra setup. Set AUTH_SECRET in
  // production so sessions cannot be forged.
  console.warn(
    "[auth] AUTH_SECRET is not set — using the development fallback secret.",
  );
  return "agroai-development-secret-change-me";
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Case-insensitive form used for uniqueness checks and login lookups. */
export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

export function isValidName(name: string): boolean {
  const normalized = normalizeName(name);
  return normalized.length >= 2 && normalized.length <= 60;
}

export function isValidPin(pin: string): boolean {
  return /^[A-Za-z0-9]{4,32}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(pin, salt, PIN_KEY_LENGTH);
  return `${PIN_PREFIX}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const [prefix, salt, hash] = stored.split("$");
  if (prefix !== PIN_PREFIX || !salt || !hash) return false;

  const derived = await scrypt(pin, salt, PIN_KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;

  return timingSafeEqual(expected, derived);
}

// ---------------------------------------------------------------------------
// Signed session cookie
// ---------------------------------------------------------------------------

function signPayload(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function createToken(farmerId: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${farmerId}.${expiresAt}`;
  return `${payload}.${signPayload(payload)}`;
}

function verifyToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [rawId, rawExpiry, signature] = parts;
  const farmerId = Number(rawId);
  const expiresAt = Number(rawExpiry);
  if (!Number.isInteger(farmerId) || farmerId <= 0) return null;
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return null;

  const expected = Buffer.from(signPayload(`${rawId}.${rawExpiry}`));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  return farmerId;
}

export async function setSessionCookie(farmerId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createToken(farmerId), sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

/**
 * `Secure` cookies require HTTPS. Production deployments should always use it;
 * the `AUTH_COOKIE_SECURE=false` escape hatch exists for local `next start`
 * smoke tests over http://localhost.
 */
function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.AUTH_COOKIE_SECURE !== "false",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function getSessionFarmerId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Returns the signed-in farmer, or null when the session is missing/invalid. */
export async function getSessionFarmer(): Promise<Farmer | null> {
  const farmerId = await getSessionFarmerId();
  if (farmerId === null) return null;

  const db = getDb();
  const rows = await db
    .select()
    .from(farmers)
    .where(eq(farmers.id, farmerId))
    .limit(1);

  return rows[0] ?? null;
}

export function toFarmerDTO(
  farmer: Farmer,
  extra?: Pick<FarmerDTO, "hasFarm" | "hasCrop">,
): FarmerDTO {
  return {
    id: farmer.id,
    name: farmer.name,
    language: farmer.language,
    createdAt: farmer.createdAt ? farmer.createdAt.toISOString() : null,
    ...extra,
  };
}
