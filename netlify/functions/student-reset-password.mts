import type { Config, Context } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json } from "../lib/http.mts";

function oid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(400, "잘못된 ID 입니다.");
  return new ObjectId(id);
}

export default handler(async (req, ctx: Context) => {
  await requireRole(req, ["admin"]);
  if (req.method !== "POST") throw new HttpError(405, "POST만 허용됩니다.");

  const id = (ctx.params as Record<string, string>).id;
  const students = await coll(COLLECTIONS.students);

  const result = await students.updateOne(
    { _id: oid(id) },
    { $unset: { passwordHash: "" }, $set: { updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) throw new HttpError(404, "학생을 찾을 수 없습니다.");

  return json({ ok: true });
});

export const config: Config = { path: "/api/students/:id/reset-password" };
