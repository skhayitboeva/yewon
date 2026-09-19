import type { Config } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { filterFromObject } from "../lib/query.mts";
import { sendMessage } from "../lib/telegram.mts";

const DEFAULT_CHUNK_SIZE = 25;
const MAX_MESSAGE_LENGTH = 4000;

interface BroadcastBody {
  message?: string;
  filters?: Record<string, string>;
  cursor?: string;
  limit?: number;
}

/**
 * Sends one page of a broadcast per call — the free Netlify tier has a 10s
 * function timeout and no background functions, so a 500+ recipient send
 * can't happen in one request. The admin page loops this until nextCursor
 * is null, so it must stay open until the broadcast finishes.
 */
export default handler(async (req) => {
  await requireRole(req, ["admin"]);
  if (req.method !== "POST") throw new HttpError(405, "지원하지 않는 메서드입니다.");

  const body = await readJson<BroadcastBody>(req);
  const message = (body.message || "").trim();
  if (!message) throw new HttpError(400, "메시지를 입력하세요.");
  if (message.length > MAX_MESSAGE_LENGTH) throw new HttpError(400, "메시지가 너무 깁니다.");

  const limit = Math.min(50, Math.max(1, Number(body.limit) || DEFAULT_CHUNK_SIZE));
  const filter: Record<string, unknown> = {
    ...filterFromObject(body.filters || {}),
    telegramId: { $exists: true, $ne: null },
  };
  if (body.cursor) {
    if (!ObjectId.isValid(body.cursor)) throw new HttpError(400, "잘못된 커서입니다.");
    filter._id = { $gt: new ObjectId(body.cursor) };
  }

  const students = await coll(COLLECTIONS.students);
  const page = await students.find(filter).sort({ _id: 1 }).limit(limit).toArray();

  let sent = 0;
  let failed = 0;
  for (const student of page) {
    const result = await sendMessage(student.telegramId as string, message);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (result.unreachable) {
        // Self-heals the recipient list — a student who blocked the bot
        // won't keep silently failing every future broadcast.
        await students.updateOne({ _id: student._id }, { $unset: { telegramId: "" } });
      }
    }
  }

  const nextCursor = page.length === limit ? String(page[page.length - 1]._id) : null;
  return json({ sent, failed, nextCursor });
});

export const config: Config = { path: "/api/broadcast" };
