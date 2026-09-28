import type { Config, Context } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { attendanceMarksSchema, parseOrThrow } from "../lib/schema.mts";
import { currentTerm } from "../lib/attendance.mts";
import { attendanceTotals, normalizeWeeks, totalsToAttendanceFields } from "../../shared/domain.ts";

function oid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(400, "잘못된 ID 입니다.");
  return new ObjectId(id);
}

export default handler(async (req, ctx: Context) => {
  const role = await requireRole(req, ["admin", "manager"]);
  const id = (ctx.params as Record<string, string>).id;

  const students = await coll(COLLECTIONS.students);
  const student = await students.findOne({ _id: oid(id) }, { projection: { studentId: 1 } });
  if (!student) throw new HttpError(404, "학생을 찾을 수 없습니다.");

  const term = await currentTerm();
  const weekly = await coll(COLLECTIONS.weeklyAttendance);
  const key = { studentId: student.studentId as string, ...term };

  const toBody = (doc: any) => {
    const weeks = normalizeWeeks(doc?.weeks);
    return {
      record: {
        ...key,
        weeks,
        source: doc?.source ?? "manual",
        updatedAt: doc?.updatedAt ?? null,
        updatedBy: doc?.updatedBy ?? null,
      },
      totals: attendanceTotals(weeks),
    };
  };

  if (req.method === "GET") {
    // 조회는 문서를 만들지 않는다 — 기록이 없으면 빈 16주를 합성해 보여 준다.
    return json(toBody(await weekly.findOne(key)));
  }

  if (req.method === "PATCH") {
    if (role !== "admin") throw new HttpError(403, "권한이 없습니다.");
    const { marks } = parseOrThrow(attendanceMarksSchema, await readJson(req));

    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now, updatedBy: role, source: "manual" };
    for (const m of marks) $set[`weeks.${m.week}.${m.mode}`] = m.value;

    const doc = await weekly.findOneAndUpdate(
      key,
      { $set, $setOnInsert: { createdAt: now } },
      { upsert: true, returnDocument: "after" }
    );

    // 총계는 파생값이라 여기서만 다시 쓴다. 필터/통계/정렬/CSV 는 계속
    // students.attendance.* 를 읽으므로 그쪽 코드는 손댈 필요가 없다.
    const result = toBody(doc);
    const fields = totalsToAttendanceFields(result.totals);
    await students.updateOne(
      { _id: oid(id) },
      {
        $set: {
          "attendance.absences": fields.absences,
          "attendance.late": fields.late,
          "attendance.absencesOffline": fields.absencesOffline,
          "attendance.absencesOnline": fields.absencesOnline,
          "attendance.lateOffline": fields.lateOffline,
          "attendance.lateOnline": fields.lateOnline,
          "attendance.riskAbsences": fields.riskAbsences,
          updatedAt: now,
        },
      }
    );
    return json(result);
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/students/:id/attendance" };
