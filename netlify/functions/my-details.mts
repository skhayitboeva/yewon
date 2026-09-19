import type { Config } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireStudent } from "../lib/auth.mts";
import { HttpError, handler, json } from "../lib/http.mts";
import { withoutPasswordHash } from "../lib/students.mts";

export default handler(async (req) => {
  if (req.method !== "GET") throw new HttpError(405, "지원하지 않는 메서드입니다.");

  // The student id comes only from the session — never from a request
  // parameter — so a student can never read another student's record.
  const sid = await requireStudent(req);
  const students = await coll(COLLECTIONS.students);
  const student = await students.findOne({ _id: new ObjectId(sid) });
  if (!student) throw new HttpError(404, "학생을 찾을 수 없습니다.");

  const consultations = await coll(COLLECTIONS.consultations);
  const rows = await consultations
    .find({ studentId: student.studentId })
    .sort({ date: -1, _id: -1 })
    .toArray();

  return json({
    student: withoutPasswordHash(student),
    consultations: rows,
    consultCount: rows.length,
    lastConsultedAt: rows[0]?.date ?? null,
  });
});

export const config: Config = { path: "/api/my/details" };
