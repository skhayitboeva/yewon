import type { Config, Context } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireAuth } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { flattenSet, parseOrThrow, studentPatchSchema } from "../lib/schema.mts";

function oid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(400, "잘못된 ID 입니다.");
  return new ObjectId(id);
}

export default handler(async (req, ctx: Context) => {
  await requireAuth(req);
  const id = (ctx.params as Record<string, string>).id;
  const students = await coll(COLLECTIONS.students);

  if (req.method === "PATCH") {
    const patch = parseOrThrow(studentPatchSchema, await readJson(req));

    if (patch.studentId) {
      const clash = await students.findOne({
        studentId: patch.studentId,
        _id: { $ne: oid(id) },
      });
      if (clash) throw new HttpError(409, `학번 ${patch.studentId} 은(는) 이미 사용 중입니다.`);
    }

    const $set = flattenSet(patch as Record<string, unknown>);
    if (Object.keys($set).length === 0) throw new HttpError(400, "변경할 항목이 없습니다.");
    $set.updatedAt = new Date();

    const updated = await students.findOneAndUpdate(
      { _id: oid(id) },
      { $set },
      { returnDocument: "after" }
    );
    if (!updated) throw new HttpError(404, "학생을 찾을 수 없습니다.");
    return json(updated);
  }

  if (req.method === "DELETE") {
    const found = await students.findOne({ _id: oid(id) });
    if (!found) throw new HttpError(404, "학생을 찾을 수 없습니다.");
    await students.deleteOne({ _id: oid(id) });
    const consultations = await coll(COLLECTIONS.consultations);
    await consultations.deleteMany({ studentId: found.studentId });
    return json({ ok: true });
  }

  if (req.method === "GET") {
    const found = await students.findOne({ _id: oid(id) });
    if (!found) throw new HttpError(404, "학생을 찾을 수 없습니다.");
    return json(found);
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/students/:id" };
