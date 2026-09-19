import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { clearLoginFailures, clientIp, enforceLoginRateLimit, recordLoginFailure, signToken } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { parseOrThrow, telegramLinkSchema } from "../lib/schema.mts";
import { validateInitData } from "../lib/telegram.mts";
import { authenticateByMobile } from "../lib/students.mts";

/** First open of the Mini App: same phone+password proof as the web login,
 * then that Telegram account is bound to the matched student for next time. */
export default handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST만 허용됩니다.");

  const ip = clientIp(req);
  await enforceLoginRateLimit(ip);

  const { initData, mobile, password } = parseOrThrow(telegramLinkSchema, await readJson(req));
  const tgUser = validateInitData(initData);

  const students = await coll(COLLECTIONS.students);

  const alreadyBoundElsewhere = await students.findOne({ telegramId: tgUser.id });
  const result = await authenticateByMobile(students, mobile, password);

  switch (result.status) {
    case "not-found":
      await recordLoginFailure(ip);
      throw new HttpError(401, "등록된 학생 정보를 찾을 수 없습니다.");
    case "password-too-short":
      throw new HttpError(400, "비밀번호는 5자 이상이어야 합니다.");
    case "wrong-password":
      await recordLoginFailure(ip);
      throw new HttpError(401, "비밀번호가 올바르지 않습니다.");
    case "check":
      // telegramLinkSchema always supplies a password, so this never happens.
      throw new HttpError(500, "서버 오류가 발생했습니다.");
  }

  if (alreadyBoundElsewhere && String(alreadyBoundElsewhere._id) !== String(result.student._id)) {
    throw new HttpError(409, "이 텔레그램 계정은 이미 다른 학생과 연결되어 있습니다.");
  }

  await students.updateOne(
    { _id: result.student._id },
    {
      $set: {
        telegramId: tgUser.id,
        telegramUsername: tgUser.username,
        telegramLinkedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  await clearLoginFailures(ip);
  const token = await signToken("user", String(result.student._id));
  return json({ token });
});

export const config: Config = { path: "/api/telegram/link" };
