#!/usr/bin/env node
/**
 * 학생 문서의 결석/지각 캐시 필드(attendance.absences 등)를 weekly_attendance
 * 로부터 다시 계산한다. 정상 상태라면 아무것도 바뀌지 않아야 한다 — 임포트나
 * 수동 DB 조작 뒤에 확인용으로 돌리는 스크립트다.
 *
 *   node scripts/recompute-attendance.mjs          # 보고만, 쓰지 않음
 *   node scripts/recompute-attendance.mjs --yes    # 적용
 */
import { MongoClient } from "mongodb";

const SEMESTER_WEEKS = 16;
const MODES = ["offline", "online"];

/** shared/domain.ts 의 attendanceTotals() 와 같은 규칙을 유지할 것. */
function attendanceTotals(weeks) {
  const per = { offline: { absences: 0, late: 0 }, online: { absences: 0, late: 0 } };
  for (let w = 1; w <= SEMESTER_WEEKS; w++) {
    const cell = weeks?.[String(w)] ?? {};
    for (const mode of MODES) {
      if (cell[mode] === "absent") per[mode].absences += 1;
      else if (cell[mode] === "late") per[mode].late += 1;
    }
  }
  return {
    offline: per.offline,
    online: per.online,
    absences: per.offline.absences + per.online.absences,
    late: per.offline.late + per.online.late,
    riskAbsences: Math.max(per.offline.absences, per.online.absences),
  };
}

const confirmed = process.argv.includes("--yes");

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

const empty = attendanceTotals();
const allStudents = await students
  .find({}, { projection: { studentId: 1, attendance: 1 } })
  .toArray();
const currentById = new Map(allStudents.map((s) => [s.studentId, s.attendance ?? {}]));

const docs = await weekly.find({ year, semester }).toArray();
const totalsById = new Map(docs.map((d) => [d.studentId, attendanceTotals(d.weeks)]));

// 이번 학기 기록이 없는 학생은 전부 0이어야 한다.
for (const id of currentById.keys()) {
  if (!totalsById.has(id)) totalsById.set(id, empty);
}

const FIELDS = [
  ["absences", "absences"],
  ["late", "late"],
  ["absencesOffline", (t) => t.offline.absences],
  ["absencesOnline", (t) => t.online.absences],
  ["lateOffline", (t) => t.offline.late],
  ["lateOnline", (t) => t.online.late],
  ["riskAbsences", "riskAbsences"],
];

const mismatches = [];
for (const [id, totals] of totalsById) {
  const current = currentById.get(id);
  if (!current) continue; // weekly_attendance 문서만 있고 학생이 삭제된 경우
  const diff = {};
  for (const [field, get] of FIELDS) {
    const want = typeof get === "function" ? get(totals) : totals[get];
    // 필드가 아예 없는 것과 값이 0인 것을 같은 걸로 치면 안 된다 — Mongo
    // 집계의 $gte/$lte 는 없는 필드를 어떤 값과도 매치시키지 않으므로,
    // "0 이니까 안 써도 된다"고 건너뛰면 그 학생은 대시보드 결석 구간 어디에도
    // 안 잡힌다 (이 스크립트의 첫 버전이 실제로 이 버그였다).
    const exists = Object.prototype.hasOwnProperty.call(current, field);
    const have = exists ? current[field] : undefined;
    if (!exists || want !== have) diff[field] = { have: exists ? have : "(missing)", want };
  }
  if (Object.keys(diff).length > 0) mismatches.push({ id, diff });
}

console.log(`students checked        ${currentById.size}`);
console.log(`weekly_attendance docs  ${docs.length}`);
console.log(`mismatches              ${mismatches.length}`);

if (mismatches.length) {
  for (const { id, diff } of mismatches.slice(0, 30)) {
    const parts = Object.entries(diff).map(([f, { have, want }]) => `${f}: ${have} -> ${want}`);
    console.log(`  ${id}  ${parts.join(", ")}`);
  }
  if (mismatches.length > 30) console.log(`  … ${mismatches.length - 30} more`);
}

if (!confirmed) {
  console.log("\n[report only] Nothing was written.");
  console.log("To apply:  node scripts/recompute-attendance.mjs --yes\n");
  await client.close();
  process.exit(0);
}

if (mismatches.length === 0) {
  console.log("\nAlready consistent — nothing to write.\n");
  await client.close();
  process.exit(0);
}

const ops = mismatches.map(({ id, diff }) => ({
  updateOne: {
    filter: { studentId: id },
    update: { $set: Object.fromEntries(Object.entries(diff).map(([f, { want }]) => [`attendance.${f}`, want])) },
  },
}));
const res = await students.bulkWrite(ops, { ordered: false });
console.log(`\nDone — ${res.modifiedCount} student(s) corrected.\n`);

await client.close();
