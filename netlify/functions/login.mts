import type { Config } from "@netlify/functions";
import {
  clearLoginFailures,
  clientIp,
  enforceLoginRateLimit,
  issueCookie,
  recordLoginFailure,
  verifyPassword,
} from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { loginSchema, parseOrThrow } from "../lib/schema.mts";
import type { Role } from "../../shared/domain.ts";

const ACCOUNTS: Record<string, { envVar: string; role: Role }> = {
  admin: { envVar: "APP_PASSWORD_HASH_ADMIN", role: "admin" },
  manager: { envVar: "APP_PASSWORD_HASH_MANAGER", role: "manager" },
};

export default handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST만 허용됩니다.");

  const ip = clientIp(req);
  await enforceLoginRateLimit(ip);

  const { username, password } = parseOrThrow(loginSchema, await readJson(req));
  const account = ACCOUNTS[username];
  const stored = account ? process.env[account.envVar] : undefined;

  if (!account || !stored) {
    if (account && !stored) {
      throw new HttpError(500, `${account.envVar} 환경변수가 설정되지 않았습니다.`);
    }
    await recordLoginFailure(ip);
    throw new HttpError(401, "아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  const ok = await verifyPassword(password, stored);

  if (!ok) {
    await recordLoginFailure(ip);
    throw new HttpError(401, "아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  await clearLoginFailures(ip);
  return json({ ok: true }, { headers: { "set-cookie": await issueCookie(account.role) } });
});

export const config: Config = { path: "/api/login" };
