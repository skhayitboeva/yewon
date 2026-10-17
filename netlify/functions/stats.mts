import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { handler, json } from "../lib/http.mts";
import { ABSENCE_BUCKETS, ENROLLED_STATUSES } from "../../shared/domain.ts";

const gtZero = (field: string) => ({ $cond: [{ $gt: [`$${field}`, 0] }, 1, 0] });
const inRange = (field: string, min: number, max: number | null) => ({
  $cond: [
    max === null
      ? { $gte: [`$${field}`, min] }
      : {
          $and: [{ $gte: [`$${field}`, min] }, { $lte: [`$${field}`, max] }],
        },
    1,
    0,
  ],
});
/** 결석 구간을 세는 $group 스테이지 — shared/domain.ts 의 ABSENCE_BUCKETS 를
 * 그대로 따라가므로 구간이 바뀌어도 이 파일은 손댈 필요가 없다.
 * all = riskAbsences(F 위험, 두 과목 중 큰 값), offline/online 은 각 과목 결석 기준. */
const absenceGroup = (field: string) => [
  {
    $group: {
      _id: null,
      ...Object.fromEntries(
        ABSENCE_BUCKETS.map((b) => [b.key, { $sum: inRange(field, b.min, b.max) }])
      ),
    },
  },
];
/** 위 $group 결과가 비어 있을 때(학생 0명) 쓰는 기본값. */
const emptyAbsenceCounts = () =>
  Object.fromEntries(ABSENCE_BUCKETS.map((b) => [b.key, 0])) as Record<
    (typeof ABSENCE_BUCKETS)[number]["key"],
    number
  >;

export default handler(async (req) => {
  await requireRole(req, ["admin", "manager"]);
  const students = await coll(COLLECTIONS.students);
  const consultations = await coll(COLLECTIONS.consultations);
  const settingsColl = await coll(COLLECTIONS.settings);

  // 대시보드는 재학 중인 학생만 센다 — 휴학/졸업/제적/자퇴와 소프트 삭제(삭제)
  // 레코드가 섞이면 총원부터 등록금·출결 비율까지 전부 어긋난다. 이 $match 가
  // $facet 앞에 있으므로 아래 모든 facet 이 같은 모집단을 본다.
  const enrolledMatch = { enrollStatus: { $in: [...ENROLLED_STATUSES] } };

  const [facet] = await students
    .aggregate([
      { $match: enrolledMatch },
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

          // Scoped to 부분납부 (partially paid) only — 완납/미납 students are
          // already fully accounted for by the payment-status counts above,
          // so mixing them in here would just inflate every term equally.
          terms: [
            { $match: { "tuition.status": "부분납부" } },
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

          absence: absenceGroup("attendance.riskAbsences"),
          absenceOffline: absenceGroup("attendance.absencesOffline"),
          absenceOnline: absenceGroup("attendance.absencesOnline"),

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

  // 대시보드 "기타" 카드 — 재학이 아닌 학생 수. 이 카드만 모집단 밖을 센다.
  const others = await students.countDocuments({
    enrollStatus: { $nin: [...ENROLLED_STATUSES] },
  });

  // 상담 통계도 같은 모집단으로 — consultations 에는 학적이 없으므로 재학 중인
  // 학번 목록을 먼저 뽑아서 거른다.
  const enrolledIds = await students.distinct("studentId", enrolledMatch);

  const [consultByCategory, recentConsults] = await Promise.all([
    consultations
      .aggregate([
        { $match: { studentId: { $in: enrolledIds } } },
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
        { $match: { studentId: { $in: enrolledIds } } },
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
    others,
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
    absence: {
      all: first(facet.absence as any[], emptyAbsenceCounts()),
      offline: first(facet.absenceOffline as any[], emptyAbsenceCounts()),
      online: first(facet.absenceOnline as any[], emptyAbsenceCounts()),
    },
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
