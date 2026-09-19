import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { infoSchema, parseOrThrow } from "../lib/schema.mts";

export default handler(async (req) => {
  const role = await requireRole(req, ["admin", "manager", "user"]);
  const info = await coll(COLLECTIONS.info);

  if (req.method === "GET") {
    const doc = await info.findOne({ _id: "app" as any });
    return json({
      tuitionDeadline: doc?.tuitionDeadline ?? "",
      classTimeUndergraduate: doc?.classTimeUndergraduate ?? "",
      classTimeGraduate: doc?.classTimeGraduate ?? "",
      visaApplicationTime: doc?.visaApplicationTime ?? "",
      orientation: doc?.orientation ?? "",
      items: doc?.items ?? [],
    });
  }

  if (req.method === "PUT") {
    if (role !== "admin") throw new HttpError(403, "권한이 없습니다.");
    const input = parseOrThrow(infoSchema, await readJson(req));
    await info.updateOne(
      { _id: "app" as any },
      { $set: { ...input, updatedAt: new Date() } },
      { upsert: true }
    );
    return json(input);
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/info" };
