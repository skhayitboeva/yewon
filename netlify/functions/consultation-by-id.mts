import type { Config, Context } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { consultationPatchSchema, parseOrThrow } from "../lib/schema.mts";

export default handler(async (req, ctx: Context) => {
  await requireRole(req, ["admin"]);
  const id = (ctx.params as Record<string, string>).id;
  if (!ObjectId.isValid(id)) throw new HttpError(400, "잘못된 ID 입니다.");
  const _id = new ObjectId(id);
  const consultations = await coll(COLLECTIONS.consultations);

  if (req.method === "PATCH") {
    const patch = parseOrThrow(consultationPatchSchema, await readJson(req));
    if (Object.keys(patch).length === 0) throw new HttpError(400, "변경할 항목이 없습니다.");
    const updated = await consultations.findOneAndUpdate(
      { _id },
      { $set: { ...patch, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!updated) throw new HttpError(404, "상담 기록을 찾을 수 없습니다.");
    return json(updated);
  }

  if (req.method === "DELETE") {
    const res = await consultations.deleteOne({ _id });
    if (res.deletedCount === 0) throw new HttpError(404, "상담 기록을 찾을 수 없습니다.");
    return json({ ok: true });
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/consultations/:id" };
