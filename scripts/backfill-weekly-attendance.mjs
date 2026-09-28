#!/usr/bin/env node
/**
 * 손으로 입력된 기존 결석/지각 총계를 weekly_attendance 임시 주차에 배치한다.
 *
 * 이번 학기에 weekly_attendance 기록이 없는데 attendance.absences 또는
 * attendance.late 가 0보다 큰 학생이 대상이다 — 대면 주차부터 채운다 (기존
 * 관리팀 시트가 대면 출결 기준이었기 때문). 총계(결석/지각 합계)는 정확히
 * 보존되므로 이 스크립트를 돌려도 대시보드 숫자는 하나도 바뀌지 않는다.
 * 다만 "몇 주차"였는지는 알 수 없으므로 자리표시(placeholder)일 뿐이고,
 * 화면에는 "이전 기록" 배지가 붙는다 — 관리자가 실제 주차로 고쳐야 한다.
 *
 * 16주를 넘으면(대면 결석+지각 > 16) 남는 만큼 온라인 주차로 이어서 채우고,
 * 32칸(대면 16 + 온라인 16)도 넘으면 넘친 횟수를 보고만 하고 버린다 — 그런
 * 경우는 데이터 오류일 가능성이 높다.
 *
 *   node scripts/backfill-weekly-attendance.mjs          # 보고만, 쓰지 않음
 *   node scripts/backfill-weekly-attendance.mjs --yes    # 적용
 *
 * 이 스크립트는 weekly_attendance 만 채운다. 그 다음
 *   node scripts/recompute-attendance.mjs --yes
 * 를 돌려서 학생 문서의 파생 필드(riskAbsences 등 — 이번 기능으로 새로
 * 생긴 필드라 기존 문서에는 아직 없다)를 전원 채워야 필터/통계가 정확해진다.
 */
import { MongoClient } from "mongodb";

const SEMESTER_WEEKS = 16;
const confirmed = process.argv.includes("--yes");

/** 결석 N개 + 지각 M개를 대면 주차부터, 넘치면 온라인 주차로 채운다.
 * 반환하는 weeks 는 합계(결석/지각)를 그대로 보존한다 — 어디에 놓였는지만
 * 자리표시일 뿐이다. */
function placeholderWeeks(absences, late) {
  const marks = [
    ...Array(absences).fill("absent"),
    ...Array(late).fill("late"),
  ];
  const capacity = SEMESTER_WEEKS * 2;
  const overflow = Math.max(0, marks.length - capacity);
  const capped = marks.slice(0, capacity);

  const weeks = {};
  let i = 0;
  for (let w = 1; w <= SEMESTER_WEEKS && i < capped.length; w++, i++) {
    weeks[w] = { offline: capped[i], online: null };
  }
  for (let w = 1; w <= SEMESTER_WEEKS && i < capped.length; w++, i++) {
    weeks[w] = { ...(weeks[w] ?? { offline: null }), online: capped[i] };
  }
  return { weeks, overflow };
}

const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB || "yewon_sms";
if (!URI) {
  console.error("Set MONGODB_URI first:  set -a && source .env && set +a");
  process.exit(1);
}

const client = new MongoClient(URI);
await client.connect();
const db = client.db(DB);
const students = db.collection("students");
const weekly = db.collection("weekly_attendance");

const settingsDoc = await db.collection("settings").findOne({ _id: "app" });
const year = settingsDoc?.currentYear ?? new Date().getFullYear();
const semester = settingsDoc?.currentSemester ?? 2;
console.log(`Term  ${year}년 ${semester}학기 (설정값 기준)\n`);

const legacy = await students
  .find(
    { $or: [{ "attendance.absences": { $gt: 0 } }, { "attendance.late": { $gt: 0 } }] },
    { projection: { studentId: 1, nameKo: 1, attendance: 1 } }
  )
  .toArray();

const existingDocs = await weekly
  .find({ year, semester, studentId: { $in: legacy.map((s) => s.studentId) } }, { projection: { studentId: 1 } })
  .toArray();
const hasRecord = new Set(existingDocs.map((d) => d.studentId));

const targets = legacy.filter((s) => !hasRecord.has(s.studentId));

console.log(`students with non-zero legacy total   ${legacy.length}`);
console.log(`already have a weekly record           ${legacy.length - targets.length}`);
console.log(`to backfill                            ${targets.length}`);

let overflowCount = 0;
const plans = targets.map((s) => {
  const absences = s.attendance?.absences ?? 0;
  const late = s.attendance?.late ?? 0;
  const { weeks, overflow } = placeholderWeeks(absences, late);
  if (overflow > 0) overflowCount++;
  return { studentId: s.studentId, nameKo: s.nameKo, absences, late, weeks, overflow };
});

const withOverflow = plans.filter((p) => p.overflow > 0);
if (withOverflow.length) {
  console.log(`\n  ! ${withOverflow.length} student(s) exceed 32 combined marks — overflow dropped, review by hand:`);
  for (const p of withOverflow) {
    console.log(`      ${p.studentId} (${p.nameKo}): 결석 ${p.absences} + 지각 ${p.late}, ${p.overflow}개 초과`);
  }
}

if (!confirmed) {
  console.log("\n[report only] Nothing was written.");
  console.log("To apply:  node scripts/backfill-weekly-attendance.mjs --yes\n");
  await client.close();
  process.exit(0);
}

if (plans.length === 0) {
  console.log("\nNothing to backfill.\n");
  await client.close();
  process.exit(0);
}

const now = new Date();
const ops = plans.map((p) => ({
  updateOne: {
    filter: { studentId: p.studentId, year, semester },
    update: {
      $set: {
        weeks: p.weeks,
        source: "legacy-import",
        updatedAt: now,
        updatedBy: "backfill-weekly-attendance",
      },
      $setOnInsert: { createdAt: now },
    },
    upsert: true,
  },
}));
const res = await weekly.bulkWrite(ops, { ordered: false });

console.log(`\nDone — ${res.upsertedCount + res.modifiedCount} student(s) backfilled.`);
console.log("Next:  node scripts/recompute-attendance.mjs --yes\n");

await client.close();
