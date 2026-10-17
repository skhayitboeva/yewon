#!/usr/bin/env node
/**
 * 반배정 명단 / 출석명부(.xlsx) -> classes 컬렉션.
 *
 *   node scripts/import-classes.mjs "출석명부.xlsx" "반배정명단.xlsx"
 *   node scripts/import-classes.mjs "출석명부.xlsx" "반배정명단.xlsx" --yes
 *
 * 두 명부는 생김새가 달라서 시트마다 모양을 보고 알아서 판단한다 — 파일 순서는
 * 상관없다. 학생 문서는 건드리지 않으며, classes 는 명부에서 언제든 다시 만들 수
 * 있는 파생 데이터라 --yes 는 해당 학기 문서를 지우고 다시 넣는다.
 *
 * 명부에는 수업 시각이 없다. 요일은 학부 시트 이름에만 있고(예 "7반(수)"),
 * 대학원 출석명부에는 강의실과 교수만 있다.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";

/** shared/domain.ts 의 CLASS_DAYS 와 같은 순서 — 이 스크립트는 TS 를 import 하지
 * 않는 다른 스크립트들과 같은 규칙을 따른다. */
const CLASS_DAYS = ["월", "화", "수", "목", "금"];
/** 반이 아닌 시트 — 교재 수량표, 전과예정자(2027-1 전과 대상) 목록. */
const SKIP_SHEETS = ["교재", "전과예정자"];

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const confirmed = args.includes("--yes");

if (files.length === 0) {
  console.error(
    'Usage: node scripts/import-classes.mjs "<file.xlsx>" [more.xlsx ...] [--year=2026] [--semester=2] [--yes]'
  );
  process.exit(1);
}

const cell = (v) => String(v ?? "").trim();
const normHeader = (h) => String(h).replace(/[\r\n]+/g, "").trim();

/* ------------------------------------------------------------------- parse */
/** "7반(수)" / "10반(목)_영어트랙1반" / "15반(목)_편입" */
const UNDERGRAD_SHEET = /^(\d+)반\((월|화|수|목|금)\)(?:[_\s]*(.+))?$/;

/** "강의실: 인재105 / 인원: 37 (변경X)" -> room, rosterCount, note.
 * 구분자 앞뒤 공백이 빠진 "인재관201/ 인원: 37" 도 받아 준다. */
function parseRoomLine(text) {
  const m = /강의실\s*:\s*(.*?)\s*\/\s*인원\s*:\s*(.*)$/.exec(text);
  if (!m) return { room: text, rosterCount: 0, note: "" };
  const count = /^\s*(\d+)\s*(.*)$/.exec(m[2]) ?? [];
  return {
    room: m[1].trim(),
    rosterCount: Number(count[1] || 0),
    note: (count[2] || "").replace(/^[()\s]+|[()\s]+$/g, "").trim(),
  };
}

/** "엔터테인먼트경영 1-C 328-1호 출석명단" -> program / name / room.
 * "문화예술관광 322호 출석명단" 처럼 반 이름이 없으면 시트 이름을 쓴다. */
function parseGradTitle(title, sheetName) {
  const parts = title.replace(/출석명단\s*$/, "").trim().split(/\s+/).filter(Boolean);
  const room = parts.length > 1 ? parts[parts.length - 1] : "";
  const program = parts.length > 1 ? parts[0] : "";
  const middle = parts.slice(1, -1).join(" ");
  return { program, name: middle || sheetName.trim(), room };
}

const parsed = [];
const skipped = [];

for (const file of files) {
  const wb = XLSX.read(readFileSync(file), { cellDates: false });
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
    const title = cell((rows[0] || [])[0]);

    if (SKIP_SHEETS.includes(sheetName.trim())) {
      skipped.push(`${sheetName} (반이 아님)`);
      continue;
    }

    const under = UNDERGRAD_SHEET.exec(sheetName.trim());
    if (under) {
      const [, number, day, track] = under;
      const { room, rosterCount, note } = parseRoomLine(title);
      const header = (rows[1] || []).map(normHeader);
      const idAt = header.indexOf("학번");
      if (idAt < 0) {
        skipped.push(`${sheetName} (학번 헤더 없음)`);
        continue;
      }
      const studentIds = rows
        .slice(2)
        .map((r) => cell(r[idAt]))
        .filter(Boolean);
      parsed.push({
        level: "학부",
        name: `${number}반`,
        sortKey: Number(number),
        day,
        room,
        program: "",
        track: (track || "").trim(),
        note,
        instructors: [],
        // 실제로 실린 줄 수를 전체 인원으로 쓴다 — 시트의 "인원:" 숫자가 줄 수와
        // 어긋나는 반이 있어서(8반 37 vs 38줄) 눈에 보이는 명단을 기준으로 둔다.
        rosterCount: studentIds.length,
        declaredCount: rosterCount,
        studentIds,
        source: basename(file),
        sheet: sheetName,
      });
      continue;
    }

    if (/출석명단\s*$/.test(title)) {
      const { program, name, room } = parseGradTitle(title, sheetName);
      // 헤더 행(3행)의 7열부터는 주차마다 되풀이되는 교수 이름이다.
      const header = (rows[3] || []).map(normHeader);
      const instructors = [...new Set(header.slice(7).filter(Boolean))];
      const studentIds = rows
        .slice(4)
        .map((r) => cell(r[1]))
        .filter(Boolean);
      parsed.push({
        level: "대학원",
        name,
        sortKey: 0,
        day: "",
        room,
        program,
        track: "",
        note: "",
        instructors,
        rosterCount: studentIds.length,
        studentIds,
        source: basename(file),
        sheet: sheetName,
      });
      continue;
    }

    skipped.push(`${sheetName} (모양을 알 수 없음)`);
  }
  console.log(`\n${basename(file)}  sheets ${wb.SheetNames.length}`);
}

if (parsed.length === 0) {
  console.error("\n반으로 읽힌 시트가 없습니다.");
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
const classes = db.collection("classes");

const settings = await db.collection("settings").findOne({ _id: "app" });
const year = Number(flag("year", settings?.currentYear ?? new Date().getFullYear()));
const semester = Number(flag("semester", settings?.currentSemester ?? 2));

const ourIds = new Set(await students.distinct("studentId"));

const dayOrder = (d) => (d ? CLASS_DAYS.indexOf(d) : -1);
parsed.sort(
  (a, b) =>
    (a.level === b.level ? 0 : a.level === "대학원" ? -1 : 1) ||
    dayOrder(a.day) - dayOrder(b.day) ||
    a.sortKey - b.sortKey ||
    a.name.localeCompare(b.name, "ko")
);

const docs = parsed.map((c) => ({
  _id: `${year}-${semester}-${c.level}-${c.name}`,
  year,
  semester,
  level: c.level,
  name: c.name,
  day: c.day,
  room: c.room,
  program: c.program,
  track: c.track,
  note: c.note,
  instructors: c.instructors,
  rosterCount: c.rosterCount,
  studentIds: c.studentIds,
  source: c.source,
  sheet: c.sheet,
  updatedAt: new Date(),
}));

console.log(`\n-- ${year}-${semester} 반 (${docs.length}) ---------------------`);
let ourTotal = 0;
const countMismatch = [];
for (const c of parsed) {
  const ours = c.studentIds.filter((id) => ourIds.has(id)).length;
  ourTotal += ours;
  if (c.declaredCount && c.declaredCount !== c.rosterCount) {
    countMismatch.push(`${c.name}: 인원 ${c.declaredCount} vs 명단 ${c.rosterCount}줄`);
  }
  console.log(
    `  ${c.level}  ${c.name.padEnd(6)} ${(c.day || "-").padEnd(2)} ${c.room.padEnd(14)}` +
      `  전체 ${String(c.rosterCount).padStart(4)}  우리 ${String(ours).padStart(3)}` +
      (c.track ? `  [${c.track}]` : "") +
      (c.instructors.length ? `  교수 ${c.instructors.join(",")}` : "")
  );
}

const dupes = docs.map((d) => d._id).filter((id, i, a) => a.indexOf(id) !== i);
if (dupes.length) {
  console.error(`\n! 반 이름이 겹칩니다 — 시트를 확인하세요: ${[...new Set(dupes)].join(", ")}`);
  await client.close();
  process.exit(1);
}

console.log("\n-- Summary -------------------------------");
console.log(`  classes               ${docs.length}  (대학원 ${docs.filter((d) => d.level === "대학원").length} / 학부 ${docs.filter((d) => d.level === "학부").length})`);
console.log(`  명부 전체 인원          ${parsed.reduce((n, c) => n + c.studentIds.length, 0)}`);
console.log(`  그 중 우리 학생         ${ourTotal}`);
if (countMismatch.length) {
  console.log(`  ! 인원 표기와 명단 줄 수가 다른 반 ${countMismatch.length}`);
  for (const m of countMismatch) console.log(`      ${m}`);
}
console.log(`  skipped sheets        ${skipped.length}${skipped.length ? "  " + skipped.join(", ") : ""}`);
console.log(`  this term in DB now   ${await classes.countDocuments({ year, semester })}`);

if (!confirmed) {
  console.log("\n[report only] Nothing was written.");
  console.log("To apply:  add --yes\n");
  await client.close();
  process.exit(0);
}

await classes.createIndex({ year: 1, semester: 1 }, { name: "term" });
await classes.createIndex({ level: 1, day: 1, name: 1 }, { name: "level_day_name" });

// 명부에서 언제든 다시 만들 수 있는 데이터라 해당 학기만 통째로 갈아 끼운다 —
// 반이 없어지거나 이름이 바뀌어도 옛 문서가 남지 않는다.
const { deletedCount } = await classes.deleteMany({ year, semester });
const { insertedCount } = await classes.insertMany(docs, { ordered: false });
console.log(`\nDone — removed ${deletedCount}, inserted ${insertedCount}.`);
console.log(`${year}-${semester} classes in DB ${await classes.countDocuments({ year, semester })}\n`);

await client.close();
