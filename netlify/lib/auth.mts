import { SignJWT, jwtVerify } from "jose";
import { scrypt as _scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./http.mts";

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

export async function issueCookie(): Promise<string> {
  const token = await new SignJWT({ role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ].join("; ");
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
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

export async function isAuthed(req: Request): Promise<boolean> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return false;
  try {
    await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

/** Call at the top of every protected function. */
export async function requireAuth(req: Request): Promise<void> {
  if (!(await isAuthed(req))) throw new HttpError(401, "로그인이 필요합니다.");
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
