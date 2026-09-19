import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { clientIp, issueCookie, verifyPassword } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { loginSchema, parseOrThrow } from "../lib/schema.mts";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

export default handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST만 허용됩니다.");

  const stored = process.env.APP_PASSWORD_HASH;
  if (!stored) throw new HttpError(500, "APP_PASSWORD_HASH 환경변수가 설정되지 않았습니다.");

  const ip = clientIp(req);
  const attempts = await coll(COLLECTIONS.loginAttempts);
  const since = new Date(Date.now() - WINDOW_MS);
  const recent = await attempts.countDocuments({ ip, at: { $gte: since } });
  if (recent >= MAX_FAILURES) {
    throw new HttpError(429, "로그인 시도가 너무 많습니다. 15분 후에 다시 시도하세요.");
  }

  const { password } = parseOrThrow(loginSchema, await readJson(req));
  const ok = await verifyPassword(password, stored);

  if (!ok) {
    await attempts.insertOne({ ip, at: new Date() });
    throw new HttpError(401, "비밀번호가 올바르지 않습니다.");
  }

  await attempts.deleteMany({ ip });
  return json({ ok: true }, { headers: { "set-cookie": await issueCookie() } });
});

export const config: Config = { path: "/api/login" };
