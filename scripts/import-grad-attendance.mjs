#!/usr/bin/env node
/**
 * 대학원 출석명부(.xlsx) -> weekly_attendance.weeks.<주차>.offline
 *
 *   node scripts/import-grad-attendance.mjs "출석명부.xlsx"
 *   node scripts/import-grad-attendance.mjs "출석명부.xlsx" --yes
 *
 * import-weekly-attendance.mjs 와 같은 일을 하지만 명부 모양이 다르다 — 한 주차가
 * 교수별로 2~3열씩 쪼개져 있어서(조예진/이은미/김푸르나) 한 주차로 합쳐야 한다.
 *
 * 이 명부의 표기:  X -> 지각,  O -> 출석,  시험 -> 출석(시험 주)
 *                자퇴희망·부친상 같은 메모는 출결 정보가 아니라 건너뛰고 보고한다.
 *
 * **앱에 사람이 입력한 기록은 덮어쓰지 않는다.** 이미 결석/지각이 들어 있는 칸은
 * 그대로 두고, 명부와 다르면 보고만 한다 — 담당자가 앱에서 6주차까지 직접
 * 입력해 둔 반면 이 명부는 1~2주차뿐이라 명부가 뒤처져 있다.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";

const SEMESTER_WEEKS = 16;
const MODES = ["offline", "online"];

/** shared/domain.ts 의 attendanceTotals() 와 같은 규칙을 유지할 것 —
 * .mjs 스크립트는 .ts 를 직접 import 할 수 없어 여기서 복제한다
 * (import-weekly-attendance.mjs 와 같은 사본). */
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
const files = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const confirmed = args.includes("--yes");
const mode = flag("mode", "offline");

if (files.length === 0 || !MODES.includes(mode)) {
  console.error(
    'Usage: node scripts/import-grad-attendance.mjs "<출석명부.xlsx>" [--mode=offline|online] [--yes]'
  );
  process.exit(1);
}

const cell = (v) => String(v ?? "").trim();

/** 칸 값 -> 표시 값.  undefined = 빈 칸(건드리지 않음), "skip" = 출결이 아닌 메모. */
function parseMark(raw) {
  const v = cell(raw);
  if (!v) return undefined;
  if (/^X/i.test(v)) return "late"; // 이 명부에서 X 는 지각이다
  if (v === "△") return "late";
  if (/^O/i.test(v)) return null; // 출석
  if (v === "시험") return null; // 시험 주 — 출석으로 본다
  return "skip"; // 자퇴희망 · 부친상 · 몽골 같은 메모
}

/* -------------------------------------------------------------------- read */
/** studentId -> Map(week -> "late" | null) */
const fileMarks = new Map();
const noteCells = [];
let sheetsRead = 0;

for (const file of files) {
  const wb = XLSX.read(readFileSync(file), { cellDates: false });
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
    if (!/출석명단\s*$/.test(cell((rows[0] || [])[0]))) continue;

    // 0행의 "N주차..." 가 블록의 시작이고, 그 뒤 빈 머리글 칸들은 같은 주차의
    // 다른 교수 열이다.
    const weekRow = rows[0] || [];
    const headerRow = rows[3] || [];
    const blocks = [];
    let current = null;
    for (let i = 7; i < Math.max(weekRow.length, headerRow.length); i++) {
      const m = /^(\d{1,2})\s*주차/.exec(cell(weekRow[i]));
      if (m) {
        const week = Number(m[1]);
        current = week >= 1 && week <= SEMESTER_WEEKS ? { week, cols: [i] } : null;
        if (current) blocks.push(current);
      } else if (current) {
        current.cols.push(i);
      }
    }

    for (const row of rows.slice(4)) {
      const id = cell(row[1]);
      if (!id) continue;
      for (const b of blocks) {
        const parsed = b.cols.map((i) => parseMark(row[i]));
        for (const [n, p] of parsed.entries()) {
          if (p === "skip") noteCells.push(`${id} ${b.week}주: ${JSON.stringify(cell(row[b.cols[n]]))}`);
        }
        const real = parsed.filter((p) => p !== undefined && p !== "skip");
        if (real.length === 0) continue;
        // 한 주차에 교수 열이 여럿 — 한 곳이라도 X 면 그 주는 지각으로 본다.
        const value = real.includes("late") ? "late" : null;
        if (!fileMarks.has(id)) fileMarks.set(id, new Map());
        fileMarks.get(id).set(b.week, value);
      }
    }
    sheetsRead++;
    const weeks = [...new Set(blocks.map((b) => b.week))].sort((a, b) => a - b);
    console.log(`  ${sheetName.padEnd(10)} 주차 ${weeks.join(",") || "-"}`);
  }
  console.log(`\n${basename(file)}  — 출석명부 시트 ${sheetsRead}`);
}

if (fileMarks.size === 0) {
  console.error("\n출석명부 모양의 시트를 찾지 못했습니다.");
  process.exit(1);
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
const year = Number(flag("year", settingsDoc?.currentYear ?? new Date().getFullYear()));
const semester = Number(flag("semester", settingsDoc?.currentSemester ?? 2));

const ourIds = new Set(
  (await students.find({}, { projection: { _id: 0, studentId: 1 } }).toArray()).map((d) => d.studentId)
);
const listed = [...fileMarks.keys()];
const mine = listed.filter((id) => ourIds.has(id));
const notOurs = listed.filter((id) => !ourIds.has(id));

const existing = await weekly.find({ studentId: { $in: mine }, year, semester }).toArray();
const byId = new Map(existing.map((d) => [d.studentId, d]));

/** 사람이 입력한 결석/지각은 건드리지 않는다. 빈 칸(또는 명시적 출석)만 채운다. */
const writes = new Map(); // id -> { [week]: value }
const conflicts = [];
let filled = 0;
let agreed = 0;
let noop = 0;

for (const id of mine) {
  for (const [week, value] of fileMarks.get(id)) {
    const current = byId.get(id)?.weeks?.[String(week)]?.[mode] ?? null;
    if (current === "absent" || current === "late") {
      if (current === value) agreed++;
      else conflicts.push(`${id} ${week}주: 앱=${current} / 명부=${value ?? "출석"} → 앱 값 유지`);
      continue;
    }
    if (value === null) {
      // 명부가 "출석"이라고 하는데 앱도 비어 있다 — 쓸 것이 없다.
      noop++;
      continue;
    }
    if (!writes.has(id)) writes.set(id, {});
    writes.get(id)[week] = value;
    filled++;
  }
}

console.log("\n-- Summary -------------------------------");
console.log(`  term                  ${year}-${semester}  (mode ${mode})`);
console.log(`  학번 on the sheet      ${listed.length}`);
console.log(`  ours                  ${mine.length}   (skipped, not ours: ${notOurs.length})`);
console.log(`  cells to write        ${filled}   (students ${writes.size})`);
console.log(`  app already agrees    ${agreed}`);
console.log(`  명부=출석, 앱도 빈 칸   ${noop}  (쓸 것 없음)`);
console.log(`  conflicts (앱 유지)    ${conflicts.length}`);
for (const c of conflicts) console.log(`      ${c}`);
if (noteCells.length) {
  console.log(`\n  출결이 아닌 메모 ${noteCells.length}건 — 건너뜀`);
  for (const n of noteCells) console.log(`      ${n}`);
}

if (!confirmed) {
  console.log("\n[report only] Nothing was written.");
  console.log("To apply:  add --yes\n");
  await client.close();
  process.exit(0);
}

if (writes.size === 0) {
  console.log("\nNothing to write.\n");
  await client.close();
  process.exit(0);
}

const now = new Date();
await weekly.bulkWrite(
  [...writes].map(([id, weeks]) => {
    const $set = { updatedAt: now, updatedBy: "import-grad-attendance", source: "sheet-import" };
    for (const [week, value] of Object.entries(weeks)) $set[`weeks.${week}.${mode}`] = value;
    return {
      updateOne: {
        filter: { studentId: id, year, semester },
        update: { $set, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    };
  }),
  { ordered: false }
);

// 총계는 파생값이라 건드린 학생만 다시 계산한다.
const touched = [...writes.keys()];
const updated = await weekly.find({ studentId: { $in: touched }, year, semester }).toArray();
await students.bulkWrite(
  updated.map((doc) => {
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
  }),
  { ordered: false }
);

console.log(`\nDone — ${filled} cell(s) across ${touched.length} student(s); totals recomputed.\n`);
await client.close();
