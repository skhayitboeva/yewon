import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { parseOrThrow, settingsSchema } from "../lib/schema.mts";

export default handler(async (req) => {
  const role = await requireRole(req, ["admin", "manager"]);
  const settings = await coll(COLLECTIONS.settings);

  if (req.method === "GET") {
    const doc = await settings.findOne({ _id: "app" as any });
    return json({
      currentYear: doc?.currentYear ?? new Date().getFullYear(),
      currentSemester: doc?.currentSemester ?? 2,
    });
  }

  if (req.method === "PUT") {
    if (role !== "admin") throw new HttpError(403, "권한이 없습니다.");
    const input = parseOrThrow(settingsSchema, await readJson(req));
    await settings.updateOne(
      { _id: "app" as any },
      { $set: { ...input, updatedAt: new Date() } },
      { upsert: true }
    );
    return json(input);
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/settings" };
