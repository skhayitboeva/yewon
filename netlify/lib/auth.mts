import { SignJWT, jwtVerify } from "jose";
import { scrypt as _scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./http.mts";
import { COLLECTIONS, coll } from "./db.mts";
import type { Role } from "../../shared/domain.ts";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

export const COOKIE_NAME = "yewon_session";
const MAX_AGE_SECONDS = 12 * 60 * 60; // 12h

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET is not set (or too short)");
  return new TextEncoder().encode(s);
}

/* ------------------------------------------------------------------ password */

/** Produces `scrypt$<saltHex>$<hashHex>` — what goes in APP_PASSWORD_HASH. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = await scrypt(password.normalize("NFKC"), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ------------------------------------------------------------------- session */

/** `netlify dev` serves plain http://, where a Secure cookie is silently dropped
 * unless the host is exactly "localhost" (e.g. 127.0.0.1 doesn't qualify). */
const IS_LOCAL_DEV = process.env.NETLIFY_DEV === "true";

export async function issueCookie(role: Role): Promise<string> {
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    ...(IS_LOCAL_DEV ? [] : ["Secure"]),
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ].join("; ");
}

export function clearCookie(): string {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    ...(IS_LOCAL_DEV ? [] : ["Secure"]),
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

export async function getSession(req: Request): Promise<{ role: Role } | null> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { role: payload.role as Role };
  } catch {
    return null;
  }
}

export async function isAuthed(req: Request): Promise<boolean> {
  return (await getSession(req)) !== null;
}

/** Call at the top of every protected function that allows any logged-in role. */
export async function requireAuth(req: Request): Promise<void> {
  if (!(await isAuthed(req))) throw new HttpError(401, "로그인이 필요합니다.");
}

/** Call at the top of a function restricted to specific roles. Returns the caller's role. */
export async function requireRole(req: Request, allowed: Role[]): Promise<Role> {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, "로그인이 필요합니다.");
  if (!allowed.includes(session.role)) throw new HttpError(403, "권한이 없습니다.");
  return session.role;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/* --------------------------------------------------------------- rate limit */
// Shared by every login surface (fixed-account login, student phone login) so
// they draw from one IP-based failure counter instead of duplicating it.

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 10;

export async function enforceLoginRateLimit(ip: string): Promise<void> {
  const attempts = await coll(COLLECTIONS.loginAttempts);
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await attempts.countDocuments({ ip, at: { $gte: since } });
  if (recent >= RATE_LIMIT_MAX_FAILURES) {
    throw new HttpError(429, "로그인 시도가 너무 많습니다. 15분 후에 다시 시도하세요.");
  }
}

export async function recordLoginFailure(ip: string): Promise<void> {
  const attempts = await coll(COLLECTIONS.loginAttempts);
  await attempts.insertOne({ ip, at: new Date() });
}

export async function clearLoginFailures(ip: string): Promise<void> {
  const attempts = await coll(COLLECTIONS.loginAttempts);
  await attempts.deleteMany({ ip });
}
