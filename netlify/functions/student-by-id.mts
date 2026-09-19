import type { Config, Context } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { flattenSet, parseOrThrow, studentPatchSchema } from "../lib/schema.mts";
import { EMPTY_TUITION, tuitionPaid } from "../../shared/domain.ts";

function oid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(400, "잘못된 ID 입니다.");
  return new ObjectId(id);
}

/** Never let the self-service login's password hash reach the browser. */
function withoutPasswordHash(doc: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash, ...rest } = doc;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

export default handler(async (req, ctx: Context) => {
  const role = await requireRole(req, ["admin", "manager"]);
  const id = (ctx.params as Record<string, string>).id;
  const students = await coll(COLLECTIONS.students);

  if (req.method === "PATCH") {
    if (role !== "admin") throw new HttpError(403, "권한이 없습니다.");
    const patch = parseOrThrow(studentPatchSchema, await readJson(req));

    if (patch.studentId) {
      const clash = await students.findOne({
        studentId: patch.studentId,
        _id: { $ne: oid(id) },
      });
      if (clash) throw new HttpError(409, `학번 ${patch.studentId} 은(는) 이미 사용 중입니다.`);
    }

    if (patch.tuition && Object.keys(patch.tuition).length > 0) {
      const current = await students.findOne(
        { _id: oid(id) },
        { projection: { tuition: 1 } }
      );
      if (!current) throw new HttpError(404, "학생을 찾을 수 없습니다.");
      const merged = { ...EMPTY_TUITION, ...current.tuition, ...patch.tuition };
      if (merged.total > 0 && tuitionPaid(merged) > merged.total) {
        throw new HttpError(400, "분할 납부 합계가 총액을 초과할 수 없습니다.");
      }
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
    return json(withoutPasswordHash(updated));
  }

  if (req.method === "DELETE") {
    if (role !== "admin") throw new HttpError(403, "권한이 없습니다.");
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
    return json(withoutPasswordHash(found));
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/students/:id" };
