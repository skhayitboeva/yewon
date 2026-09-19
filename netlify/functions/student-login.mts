import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import {
  clearLoginFailures,
  clientIp,
  enforceLoginRateLimit,
  hashPassword,
  issueCookie,
  recordLoginFailure,
  verifyPassword,
} from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { parseOrThrow, studentLoginSchema } from "../lib/schema.mts";
import { mobileMatchExpr } from "../lib/students.mts";

const MIN_PASSWORD_LENGTH = 5;

export default handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST만 허용됩니다.");

  const ip = clientIp(req);
  await enforceLoginRateLimit(ip);

  const { mobile, password } = parseOrThrow(studentLoginSchema, await readJson(req));
  const students = await coll(COLLECTIONS.students);
  const student = await students.findOne({
    enrollStatus: { $ne: "삭제" },
    ...mobileMatchExpr(mobile),
  });

  if (!student) {
    await recordLoginFailure(ip);
    throw new HttpError(401, "등록된 학생 정보를 찾을 수 없습니다.");
  }

  if (!password) {
    return json({ needsPassword: !student.passwordHash });
  }

  if (!student.passwordHash) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, "비밀번호는 5자 이상이어야 합니다.");
    }
    const passwordHash = await hashPassword(password);
    await students.updateOne(
      { _id: student._id },
      { $set: { passwordHash, updatedAt: new Date() } }
    );
    await clearLoginFailures(ip);
    return json(
      { ok: true },
      { headers: { "set-cookie": await issueCookie("user", String(student._id)) } }
    );
  }

  const ok = await verifyPassword(password, student.passwordHash);
  if (!ok) {
    await recordLoginFailure(ip);
    throw new HttpError(401, "비밀번호가 올바르지 않습니다.");
  }

  await clearLoginFailures(ip);
  return json(
    { ok: true },
    { headers: { "set-cookie": await issueCookie("user", String(student._id)) } }
  );
});

export const config: Config = { path: "/api/student-login" };
