import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { clearLoginFailures, clientIp, enforceLoginRateLimit, issueCookie, recordLoginFailure } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { parseOrThrow, studentLoginSchema } from "../lib/schema.mts";
import { authenticateByMobile } from "../lib/students.mts";

export default handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST만 허용됩니다.");

  const ip = clientIp(req);
  await enforceLoginRateLimit(ip);

  const { mobile, password } = parseOrThrow(studentLoginSchema, await readJson(req));
  const students = await coll(COLLECTIONS.students);
  const result = await authenticateByMobile(students, mobile, password);

  switch (result.status) {
    case "not-found":
      await recordLoginFailure(ip);
      throw new HttpError(401, "등록된 학생 정보를 찾을 수 없습니다.");
    case "check":
      return json({ needsPassword: result.needsPassword });
    case "password-too-short":
      throw new HttpError(400, "비밀번호는 5자 이상이어야 합니다.");
    case "wrong-password":
      await recordLoginFailure(ip);
      throw new HttpError(401, "비밀번호가 올바르지 않습니다.");
    case "claimed":
    case "verified":
      await clearLoginFailures(ip);
      return json(
        { ok: true },
        { headers: { "set-cookie": await issueCookie("user", String(result.student._id)) } }
      );
  }
});

export const config: Config = { path: "/api/student-login" };
