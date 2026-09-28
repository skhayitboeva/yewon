#!/usr/bin/env node
/**
 * 주차별 출결 시트 -> weekly_attendance.weeks.<주차>.<대면|온라인>
 *
 * scripts/import-absences.mjs 의 후속. 그 스크립트는 결석 "총계"를
 * students.attendance.absences 에 직접 썼는데, 이제 그 값은 이 컬렉션에서
 * 계산되는 파생값이라 총계를 직접 쓰면 다음 칸 클릭 한 번에 덮어써진다.
 *
 * 한 주차 시트 (대면 — 매주 받는 형태):
 *   node scripts/import-weekly-attendance.mjs "9주차.csv" --mode offline --week 9
 *
 * 여러 주차가 한 시트에 있는 경우 (온라인 — 월말에 한 번에 받는 형태).
 * 헤더가 "9주", "9주차", "week 9" 등 숫자+주 패턴이면 자동으로 주차를 찾는다:
 *   node scripts/import-weekly-attendance.mjs "10월 온라인.csv" --mode online
 *
 *   --yes    적용 (기본은 보고만 하고 쓰지 않음)
 *
 * 칸 값:  A/결석/X       -> 결석
 *         L/지각          -> 지각
 *         O/출석/0/-      -> 명시적 출석(null 로 기록)
 *         빈 칸           -> "데이터 없음", 손대지 않음 (기존 스크립트와 같은 규칙 —
 *                            시트를 다시 가져와도 앱에서 입력한 기록을 지우지 않는다)
 *
 * 학번이 학생 DB에 없으면 건너뛰고 보고한다 — 학생을 새로 만들지 않는다.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";

const SEMESTER_WEEKS = 16;
const MODES = ["offline", "online"];

/** shared/domain.ts 의 attendanceTotals() 와 같은 규칙을 유지할 것 —
 * .mjs 스크립트는 .ts 를 직접 import 할 수 없어 여기서 복제한다. */
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

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const confirmed = args.includes("--yes");
const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : null;
const explicitWeek = args.includes("--week") ? Number(args[args.indexOf("--week") + 1]) : null;

if (!file || !MODES.includes(mode)) {
  console.error(
    'Usage: node scripts/import-weekly-attendance.mjs "<sheet.csv>" --mode offline|online [--week N] [--yes]'
  );
  process.exit(1);
}
if (explicitWeek !== null && (!Number.isInteger(explicitWeek) || explicitWeek < 1 || explicitWeek > SEMESTER_WEEKS)) {
  console.error(`--week must be 1..${SEMESTER_WEEKS}`);
  process.exit(1);
}

/* -------------------------------------------------------------------- read */
let text = readFileSync(file, "utf8");
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

const wb = XLSX.read(text, { type: "string", raw: true });
const sheetName = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
  header: 1,
  defval: "",
  raw: true,
  blankrows: true,
});

const cell = (v) => String(v ?? "").trim();

const headerRow = rows.findIndex((r) => r.some((c) => cell(c) === "학번"));
if (headerRow === -1) {
  console.error("Could not find a 학번 column header in this sheet.");
  process.exit(1);
}
const header = rows[headerRow];
const idCol = header.findIndex((c) => cell(c) === "학번");

/** 헤더 텍스트에서 주차 번호를 뽑는다 — "9주", "9주차", "week 9", "W9" 등. */
function weekFromHeader(h) {
  const m = /(\d{1,2})\s*(주차|주|week)/i.exec(h) || /week\s*(\d{1,2})/i.exec(h) || /^w(\d{1,2})$/i.exec(h);
  const n = m ? Number(m[1]) : null;
  return n && n >= 1 && n <= SEMESTER_WEEKS ? n : null;
}

/** week -> column index. */
const weekCols = new Map();
if (explicitWeek !== null) {
  // 단일 주차 시트 — 결석 관련 헤더가 있는 칸을 그 주차로 본다 (기존 스크립트와 동일한 방식).
  const col = header.findIndex((c) => cell(c).includes("결석") || cell(c).includes("출결"));
  if (col === -1) {
    console.error("Could not find an attendance column header in this sheet (looked for 결석/출결).");
    process.exit(1);
  }
  weekCols.set(explicitWeek, col);
} else {
  header.forEach((h, i) => {
    const w = weekFromHeader(cell(h));
    if (w) weekCols.set(w, i);
  });
  if (weekCols.size === 0) {
    console.error(
      'No week columns found — headers should look like "9주", "9주차" or "week 9", or pass --week N for a single-week sheet.'
    );
    process.exit(1);
  }
}

console.log(`\nFile    ${basename(file)}`);
console.log(`Sheet   ${sheetName}`);
console.log(`Mode    ${mode}`);
console.log(
  `Weeks   ${[...weekCols.keys()].sort((a, b) => a - b).map((w) => `${w}주(col ${weekCols.get(w) + 1})`).join(", ")}`
);

/** 칸 값 -> 표시 값. 빈 칸은 undefined (건드리지 않음)로 구분한다. */
function parseMark(raw) {
  const v = cell(raw);
  if (!v) return undefined; // 데이터 없음 — 손대지 않는다
  if (/^(a|결석|x)$/i.test(v)) return "absent";
  if (/^(l|지각)$/i.test(v)) return "late";
  if (/^(o|출석|0|-)$/i.test(v)) return null; // 명시적 출석
  return "unknown";
}

/* --------------------------------------------------------------- collapse */
const data = rows.slice(headerRow + 1).filter((r) => cell(r[idCol]));

/** studentId -> [{week, value}] */
const marksById = new Map();
const unknownCells = [];

for (const row of data) {
  const id = cell(row[idCol]);
  for (const [week, col] of weekCols) {
    const parsed = parseMark(row[col]);
    if (parsed === undefined) continue;
    if (parsed === "unknown") {
      unknownCells.push(`${id} / ${week}주: ${JSON.stringify(cell(row[col]))}`);
      continue;
    }
    if (!marksById.has(id)) marksById.set(id, []);
    marksById.get(id).push({ week, value: parsed });
  }
}

console.log("\n-- Sheet ---------------------------------");
console.log(`  rows with 학번        ${data.length}`);
console.log(`  학번 with marks       ${marksById.size}`);
const totalMarks = [...marksById.values()].reduce((n, m) => n + m.length, 0);
console.log(`  cells to write        ${totalMarks}`);
if (unknownCells.length) {
  console.log(`\n  ! ${unknownCells.length} cell(s) with an unrecognized value, skipped`);
  for (const c of unknownCells.slice(0, 20)) console.log(`      ${c}`);
}

/* --------------------------------------------------------------- database */
const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB || "yewon_sms";
if (!URI) {
  console.error("\nSet MONGODB_URI first:  set -a && source .env && set +a");
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
console.log(`\nTerm    ${year}년 ${semester}학기 (설정값 기준)`);

const ids = [...marksById.keys()];
const existing = await students
  .find({ studentId: { $in: ids } }, { projection: { studentId: 1, _id: 0 } })
  .toArray();
const known = new Set(existing.map((d) => d.studentId));
const missing = ids.filter((id) => !known.has(id));

console.log("\n-- Database ------------------------------");
console.log(`  matched by 학번       ${ids.length - missing.length}`);
console.log(`  not in DB, skipped    ${missing.length}`);
if (missing.length) console.log(`      ${missing.join(", ")}`);

const toWrite = ids.filter((id) => known.has(id));

if (!confirmed) {
  console.log("\n[report only] Nothing was written.");
  console.log(`To apply:  node scripts/import-weekly-attendance.mjs "${file}" --mode ${mode}${explicitWeek ? ` --week ${explicitWeek}` : ""} --yes\n`);
  await client.close();
  process.exit(0);
}

if (toWrite.length === 0) {
  console.log("\nNothing to write.\n");
  await client.close();
  process.exit(0);
}

const now = new Date();
const weeklyOps = toWrite.map((id) => {
  const $set = { updatedAt: now, updatedBy: "import-weekly-attendance", source: "sheet-import" };
  for (const { week, value } of marksById.get(id)) $set[`weeks.${week}.${mode}`] = value;
  return {
    updateOne: {
      filter: { studentId: id, year, semester },
      update: { $set, $setOnInsert: { createdAt: now } },
      upsert: true,
    },
  };
});
await weekly.bulkWrite(weeklyOps, { ordered: false });

// 총계는 파생값이므로 건드린 학생만 다시 계산해서 캐시를 맞춘다.
const updatedDocs = await weekly.find({ studentId: { $in: toWrite }, year, semester }).toArray();
const totalsOps = updatedDocs.map((doc) => {
  const t = attendanceTotals(doc.weeks);
  return {
    updateOne: {
      filter: { studentId: doc.studentId },
      update: {
        $set: {
          "attendance.absences": t.absences,
          "attendance.late": t.late,
          "attendance.absencesOffline": t.offline.absences,
          "attendance.absencesOnline": t.online.absences,
          "attendance.lateOffline": t.offline.late,
          "attendance.lateOnline": t.online.late,
          "attendance.riskAbsences": t.riskAbsences,
        },
      },
    },
  };
});
if (totalsOps.length) await students.bulkWrite(totalsOps, { ordered: false });

console.log(`\nDone — ${toWrite.length} student(s)' weekly_attendance updated, totals recomputed.\n`);

await client.close();
