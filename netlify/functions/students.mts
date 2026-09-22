import type { Config } from "@netlify/functions";
import { COLLECTIONS, KO_COLLATION, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { parseOrThrow, studentCreateSchema } from "../lib/schema.mts";
import { buildStudentQuery } from "../lib/query.mts";
import { withoutPasswordHash } from "../lib/students.mts";
import { EMPTY_ATTENDANCE, EMPTY_TUITION, tuitionPaid } from "../../shared/domain.ts";

export default handler(async (req) => {
  const role = await requireRole(req, ["admin", "manager"]);
  const students = await coll(COLLECTIONS.students);

  if (req.method === "GET") {
    const url = new URL(req.url);

    // Client-side search/filter/sort: hand back the full roster in one request
    // instead of a filtered page, so the table can filter in memory.
    if (url.searchParams.get("all") === "1") {
      const consultations = await coll(COLLECTIONS.consultations);
      const [rows, counts] = await Promise.all([
        students.find({}).collation(KO_COLLATION).sort({ studentId: 1 }).toArray(),
        consultations
          .aggregate([{ $group: { _id: "$studentId", n: { $sum: 1 } } }])
          .toArray(),
      ]);
      const countBy = new Map(counts.map((c) => [c._id as string, c.n as number]));

      return json({
        rows: rows.map((r) => ({
          ...withoutPasswordHash(r as Record<string, unknown>),
          consultCount: countBy.get(r.studentId as string) || 0,
        })),
        total: rows.length,
        page: 1,
        limit: rows.length,
        pages: 1,
      });
    }

    const { filter, sort, page, limit } = buildStudentQuery(url);

    const [rows, total] = await Promise.all([
      students
        .find(filter)
        .collation(KO_COLLATION)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      students.countDocuments(filter),
    ]);

    // Attach consultation counts for the visible page only.
    const ids = rows.map((r) => r.studentId as string);
    const consultations = await coll(COLLECTIONS.consultations);
    const counts = await consultations
      .aggregate([
        { $match: { studentId: { $in: ids } } },
        { $group: { _id: "$studentId", n: { $sum: 1 } } },
      ])
      .toArray();
    const countBy = new Map(counts.map((c) => [c._id as string, c.n as number]));

    return json({
      rows: rows.map((r) => ({
        ...withoutPasswordHash(r as Record<string, unknown>),
        consultCount: countBy.get(r.studentId as string) || 0,
      })),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  if (req.method === "POST") {
    if (role !== "admin") throw new HttpError(403, "권한이 없습니다.");
    const input = parseOrThrow(studentCreateSchema, await readJson(req));

    const exists = await students.findOne({ studentId: input.studentId });
    if (exists) throw new HttpError(409, `학번 ${input.studentId} 은(는) 이미 등록되어 있습니다.`);

    const tuition = { ...EMPTY_TUITION, ...(input.tuition || {}) };
    if (tuition.total > 0 && tuitionPaid(tuition) > tuition.total) {
      throw new HttpError(400, "분할 납부 합계가 총액을 초과할 수 없습니다.");
    }

    const now = new Date();
    const doc = {
      ...input,
      tuition,
      attendance: { ...EMPTY_ATTENDANCE, ...(input.attendance || {}) },
      createdAt: now,
      updatedAt: now,
    };

    try {
      const res = await students.insertOne(doc);
      return json({ ...doc, _id: res.insertedId }, { status: 201 });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new HttpError(409, `학번 ${input.studentId} 은(는) 이미 등록되어 있습니다.`);
      }
      throw err;
    }
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/students" };
