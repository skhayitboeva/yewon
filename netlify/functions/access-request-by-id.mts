import type { Config, Context } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { accessRequestResolveSchema, parseOrThrow } from "../lib/schema.mts";
import { mobileMatchExpr } from "../lib/students.mts";

function oid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(400, "잘못된 ID 입니다.");
  return new ObjectId(id);
}

export default handler(async (req, ctx: Context) => {
  await requireRole(req, ["admin"]);
  if (req.method !== "PATCH") throw new HttpError(405, "지원하지 않는 메서드입니다.");

  const id = (ctx.params as Record<string, string>).id;
  const requests = await coll(COLLECTIONS.accessRequests);
  const request = await requests.findOne({ _id: oid(id) });
  if (!request) throw new HttpError(404, "요청을 찾을 수 없습니다.");
  if (request.status !== "pending") throw new HttpError(409, "이미 처리된 요청입니다.");

  const input = parseOrThrow(accessRequestResolveSchema, await readJson(req));

  if (input.action === "reject") {
    await requests.updateOne(
      { _id: request._id },
      { $set: { status: "rejected", resolvedAt: new Date() } }
    );
    return json({ ok: true });
  }

  const students = await coll(COLLECTIONS.students);
  const targetId = oid(input.targetId);
  const target = await students.findOne({ _id: targetId, enrollStatus: { $ne: "삭제" } });
  if (!target) throw new HttpError(404, "학생을 찾을 수 없습니다.");

  const clash = await students.findOne({
    _id: { $ne: targetId },
    enrollStatus: { $ne: "삭제" },
    ...mobileMatchExpr(request.mobile),
  });
  if (clash) throw new HttpError(409, "이미 사용 중인 휴대전화 번호입니다.");

  // Admin-confirmed, so this does not set selfEdited.mobile — the Excel
  // registry stays authoritative for this field, unlike a student's own edit.
  await students.updateOne({ _id: targetId }, { $set: { mobile: request.mobile, updatedAt: new Date() } });
  await requests.updateOne(
    { _id: request._id },
    { $set: { status: "approved", resolvedAt: new Date(), studentId: target.studentId } }
  );

  return json({ ok: true });
});

export const config: Config = { path: "/api/access-requests/:id" };
