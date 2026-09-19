import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { consultationCreateSchema, parseOrThrow } from "../lib/schema.mts";

export default handler(async (req) => {
  const role = await requireRole(req, ["admin", "manager"]);
  const consultations = await coll(COLLECTIONS.consultations);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId");
    const category = url.searchParams.get("category");

    const filter: Record<string, unknown> = {};
    if (studentId) filter.studentId = studentId;
    if (category) filter.categories = category;

    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
    const rows = await consultations
      .find(filter)
      .sort({ date: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return json({ rows });
  }

  if (req.method === "POST") {
    if (role !== "admin") throw new HttpError(403, "권한이 없습니다.");
    const input = parseOrThrow(consultationCreateSchema, await readJson(req));
    const students = await coll(COLLECTIONS.students);
    const student = await students.findOne({ studentId: input.studentId });
    if (!student) throw new HttpError(404, `학번 ${input.studentId} 학생을 찾을 수 없습니다.`);

    const now = new Date();
    const doc = { ...input, createdAt: now, updatedAt: now };
    const res = await consultations.insertOne(doc);
    return json({ ...doc, _id: res.insertedId }, { status: 201 });
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/consultations" };
