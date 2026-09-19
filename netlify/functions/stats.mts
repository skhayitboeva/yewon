import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireAuth } from "../lib/auth.mts";
import { handler, json } from "../lib/http.mts";

const gtZero = (field: string) => ({ $cond: [{ $gt: [`$${field}`, 0] }, 1, 0] });
const inRange = (min: number, max: number | null) => ({
  $cond: [
    max === null
      ? { $gte: ["$attendance.absences", min] }
      : {
          $and: [
            { $gte: ["$attendance.absences", min] },
            { $lte: ["$attendance.absences", max] },
          ],
        },
    1,
    0,
  ],
});

export default handler(async (req) => {
  await requireAuth(req);
  const students = await coll(COLLECTIONS.students);
  const consultations = await coll(COLLECTIONS.consultations);
  const settingsColl = await coll(COLLECTIONS.settings);

  const [facet] = await students
    .aggregate([
      {
        $facet: {
          total: [{ $count: "n" }],

          byLevelType: [
            {
              $group: {
                _id: { level: "$level", studentType: "$studentType" },
                count: { $sum: 1 },
              },
            },
          ],

          tuitionStatus: [{ $group: { _id: "$tuition.status", count: { $sum: 1 } } }],

          terms: [
            {
              $group: {
                _id: null,
                term1: { $sum: gtZero("tuition.term1") },
                term2: { $sum: gtZero("tuition.term2") },
                term3: { $sum: gtZero("tuition.term3") },
                term4: { $sum: gtZero("tuition.term4") },
              },
            },
          ],

          tuitionSums: [
            {
              $group: {
                _id: null,
                billed: { $sum: { $ifNull: ["$tuition.total", 0] } },
                paid: {
                  $sum: {
                    $add: [
                      { $ifNull: ["$tuition.term1", 0] },
                      { $ifNull: ["$tuition.term2", 0] },
                      { $ifNull: ["$tuition.term3", 0] },
                      { $ifNull: ["$tuition.term4", 0] },
                    ],
                  },
                },
              },
            },
          ],

          absence: [
            {
              $group: {
                _id: null,
                good: { $sum: inRange(0, 0) },
                a1: { $sum: inRange(1, 1) },
                a23: { $sum: inRange(2, 3) },
                a4: { $sum: inRange(4, null) },
              },
            },
          ],

          cohorts: [
            {
              $project: {
                level: 1,
                cohort: {
                  $cond: [
                    { $gte: [{ $strLenCP: { $ifNull: ["$admissionDate", ""] } }, 7] },
                    {
                      $concat: [
                        { $substrCP: ["$admissionDate", 0, 4] },
                        "-",
                        {
                          $cond: [
                            {
                              $gte: [
                                { $toInt: { $substrCP: ["$admissionDate", 5, 2] } },
                                7,
                              ],
                            },
                            "2",
                            "1",
                          ],
                        },
                      ],
                    },
                    "미상",
                  ],
                },
              },
            },
            { $group: { _id: { cohort: "$cohort", level: "$level" }, count: { $sum: 1 } } },
            { $sort: { "_id.cohort": 1 } },
          ],
        },
      },
    ])
    .toArray();

  const [consultByCategory, recentConsults] = await Promise.all([
    consultations
      .aggregate([
        { $unwind: "$categories" },
        {
          $group: {
            _id: "$categories",
            records: { $sum: 1 },
            students: { $addToSet: "$studentId" },
          },
        },
        { $project: { _id: 0, category: "$_id", records: 1, students: { $size: "$students" } } },
        { $sort: { records: -1 } },
      ])
      .toArray(),
    consultations
      .aggregate([
        { $sort: { date: -1, _id: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: COLLECTIONS.students,
            localField: "studentId",
            foreignField: "studentId",
            as: "s",
          },
        },
        {
          $project: {
            studentId: 1,
            date: 1,
            categories: 1,
            content: 1,
            nameKo: { $ifNull: [{ $first: "$s.nameKo" }, ""] },
          },
        },
      ])
      .toArray(),
  ]);

  const settingsDoc = await settingsColl.findOne({ _id: "app" as any });

  const first = <T,>(arr: T[] | undefined, fallback: T): T =>
    arr && arr.length ? arr[0] : fallback;

  return json({
    total: first(facet.total as { n: number }[], { n: 0 }).n,
    byLevelType: (facet.byLevelType as any[]).map((r) => ({
      level: r._id.level,
      studentType: r._id.studentType || "재학생",
      count: r.count,
    })),
    tuitionStatus: Object.fromEntries(
      (facet.tuitionStatus as any[]).map((r) => [r._id || "미납", r.count])
    ),
    terms: first(facet.terms as any[], { term1: 0, term2: 0, term3: 0, term4: 0 }),
    tuitionSums: first(facet.tuitionSums as any[], { billed: 0, paid: 0 }),
    absence: first(facet.absence as any[], { good: 0, a1: 0, a23: 0, a4: 0 }),
    cohorts: (facet.cohorts as any[]).map((r) => ({
      cohort: r._id.cohort,
      level: r._id.level,
      count: r.count,
    })),
    consultByCategory,
    recentConsults,
    settings: {
      currentYear: settingsDoc?.currentYear ?? new Date().getFullYear(),
      currentSemester: settingsDoc?.currentSemester ?? 2,
    },
  });
});

export const config: Config = { path: "/api/stats" };
