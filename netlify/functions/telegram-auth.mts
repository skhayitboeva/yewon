import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { signToken } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { parseOrThrow, telegramAuthSchema } from "../lib/schema.mts";
import { validateInitData } from "../lib/telegram.mts";

/** Reopening the Mini App: if this Telegram id is already bound to a student,
 * hand back a session token with no phone/password needed. */
export default handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST만 허용됩니다.");

  const { initData } = parseOrThrow(telegramAuthSchema, await readJson(req));
  const tgUser = validateInitData(initData);

  const students = await coll(COLLECTIONS.students);
  const student = await students.findOne({
    telegramId: tgUser.id,
    enrollStatus: { $ne: "삭제" },
  });

  if (!student) return json({ linked: false });

  const token = await signToken("user", String(student._id));
  return json({ linked: true, token });
});

export const config: Config = { path: "/api/telegram/auth" };
