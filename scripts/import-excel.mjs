#!/usr/bin/env node
/**
 * Excel (.xlsx) -> MongoDB migration for the 학사시스템 export.
 *
 *   node scripts/import-excel.mjs "students.xlsx" --dry-run
 *   node scripts/import-excel.mjs "students.xlsx" --mode=upsert
 *   node scripts/import-excel.mjs "students.xlsx" --mode=replace
 *
 * Defaults to --dry-run: reports what would change and writes nothing.
 * upsert only refreshes academic fields; tuition / attendance / contactCount /
 * memo are entered in the app and are never touched here.
 *
 * Only rows matching BOTH --nationality and --campus are imported; the export
 * contains every campus and nationality.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";

/* ------------------------------------------------------------------ config */
const DEFAULTS = {
  nationality: "우즈베키스탄",
  campus: "경기드림캠퍼스",
  newDate: "2026-08-31",
  level: "학부",
};

/** Excel header -> DB field. Headers are `category|field`; `\r\n` inside a
 * header is stripped before lookup, so write keys without line breaks. */
const HEADER_MAP = {
  학번: "studentId",
  성명: "nameKo",
  "성명(영문)": "nameEn",
  생년월일: "birthDate",
  성별: "gender",
  학년: "grade",
  학기차: "semesterNo",
  학적: "enrollStatus",
  학부: "faculty",
  대학원: "gradSchool",
  전공: "major",
  과정: "course",
  "입학정보|입학일자": "admissionDate",
  "입학정보|입학구분": "admissionType",
  "학생주소|국적": "nationality",
  "학생주소|주소1": "address1",
  "학생주소|주소2": "address2",
  "학생주소|전화번호": "tel1",
  "학생주소|휴대전화": "tel2",
  "학생주소|긴급연락처": "tel3",
  "학생주소|Email": "email",
  "최종등록|년도": "lastRegYear",
  "최종등록|학기": "lastRegSemester",
};

/** Columns read for the filter but never written as-is. */
const FILTER_ONLY = new Set(["본분교", "입학정보|외국인여부"]);

/** Fields that come from Excel. tuition/attendance/contactCount/memo never do. */
const ACADEMIC_FIELDS = [
  "level",
  "nameKo",
  "nameEn",
  "birthDate",
  "gender",
  "grade",
  "semesterNo",
  "enrollStatus",
  "major",
  "faculty",
  "gradSchool",
  "course",
  "admissionDate",
  "admissionType",
  "nationality",
  "address",
  "phone",
  "mobile",
  "email",
  "lastRegYear",
  "lastRegSemester",
];

/* ----------------------------------------------------------------- helpers */
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const mode = flag("mode", "upsert");
const dryRun = args.includes("--dry-run") || !args.some((a) => a.startsWith("--mode="));
const nationality = flag("nationality", DEFAULTS.nationality);
const campus = flag("campus", DEFAULTS.campus);
const newDate = flag("new-date", DEFAULTS.newDate);
const level = flag("level", DEFAULTS.level);
/** Graduate export only — 근로자트랙 students are managed by another team. Empty
 * by default so the undergraduate file, which has no such column, is unaffected. */
const excludeTrack = flag("exclude-track", "");

if (!file) {
  console.error(
    "Usage: node scripts/import-excel.mjs <file.xlsx> [--dry-run|--mode=upsert|--mode=replace|--mode=insert-only]\n" +
      "       [--nationality=우즈베키스탄] [--campus=경기드림캠퍼스] [--new-date=2026-08-31]\n" +
      "       [--level=학부] [--exclude-track=근로자트랙]"
  );
  process.exit(1);
}
if (!["upsert", "replace", "insert-only"].includes(mode)) {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}

/** Header text as written in the sheet -> lookup key. */
const normHeader = (h) => String(h).replace(/[\r\n]+/g, "").trim();

/** The export uses "0", "-" and "N/A" as empty markers. */
const clean = (v) => {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "0" || s === "-" || s.toUpperCase() === "N/A" ? "" : s;
};

/** Excel date (serial number or text) -> "YYYY-MM-DD". */
function toDate(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(value).trim();
  const m = /^(\d{4})[./-]?(\d{1,2})[./-]?(\d{1,2})$/.exec(s.replace(/\s/g, ""));
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return s;
}

/** Digits only; anything too short to be a real number becomes "". */
function toPhone(value) {
  const d = clean(value).replace(/\D/g, "");
  return d.length >= 9 && d.length <= 11 ? d : "";
}

/* -------------------------------------------------------------------- read */
const wb = XLSX.read(readFileSync(file), { cellDates: false });
const sheetName = wb.SheetNames[0];
const rowsRaw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });

console.log(`\nFile   ${basename(file)}`);
console.log(`Sheet  ${sheetName}`);
console.log(`Rows   ${rowsRaw.length}`);
console.log(`Filter ${nationality} + ${campus}   |   신입생 if 입학일자 = ${newDate}   |   level ${level}`);
if (excludeTrack) console.log(`       excluding 외국인여부 = ${excludeTrack}`);

const headers = Object.keys(rowsRaw[0] || {});
const mapped = headers.filter((h) => HEADER_MAP[normHeader(h)]);
const unmapped = headers.filter(
  (h) => !HEADER_MAP[normHeader(h)] && !FILTER_ONLY.has(normHeader(h))
);

console.log("\n-- Column mapping ------------------------");
for (const h of mapped) console.log(`  ok  ${normHeader(h).padEnd(20)} -> ${HEADER_MAP[normHeader(h)]}`);
for (const h of FILTER_ONLY) console.log(`  ok  ${h.padEnd(20)} -> (filter only)`);
console.log(`  ${unmapped.length} column(s) ignored: ${unmapped.map(normHeader).join(", ") || "none"}`);

/* ---------------------------------------------------------------- transform */
const problems = [];
const seen = new Map();
const docs = [];
let skippedFilter = 0;
let skippedTrack = 0;

rowsRaw.forEach((row, i) => {
  const lineNo = i + 2; // header is row 1

  const get = (header) => {
    for (const [k, v] of Object.entries(row)) if (normHeader(k) === header) return v;
    return "";
  };

  if (clean(get("학생주소|국적")) !== nationality || clean(get("본분교")) !== campus) {
    skippedFilter++;
    return;
  }
  if (excludeTrack && clean(get("입학정보|외국인여부")) === excludeTrack) {
    skippedTrack++;
    return;
  }

  const out = {};
  for (const [header, value] of Object.entries(row)) {
    const field = HEADER_MAP[normHeader(header)];
    if (!field) continue;
    out[field] =
      field === "birthDate" || field === "admissionDate" ? toDate(value) : clean(value);
  }

  out.address = [out.address1, out.address2].filter(Boolean).join(" ").trim();
  delete out.address1;
  delete out.address2;

  // 학사시스템 spreads contact numbers across three columns and fills them
  // inconsistently — keep every distinct number in `phone`, and use the first
  // real 010 number as `mobile`, which is what student login matches on.
  const numbers = [out.tel2, out.tel1, out.tel3].map(toPhone).filter(Boolean);
  const unique = [...new Set(numbers)];
  out.phone = unique.join("/");
  out.mobile = unique.find((n) => n.length === 11 && n.startsWith("010")) || "";
  delete out.tel1;
  delete out.tel2;
  delete out.tel3;

  if (!out.studentId) {
    problems.push(`row ${lineNo}: no 학번 — skipped`);
    return;
  }
  if (seen.has(out.studentId)) {
    problems.push(`row ${lineNo}: 학번 ${out.studentId} duplicates row ${seen.get(out.studentId)}`);
    return;
  }
  seen.set(out.studentId, lineNo);

  if (!out.nameKo) problems.push(`row ${lineNo}: no 성명 (${out.studentId})`);
  for (const f of ["birthDate", "admissionDate"]) {
    if (out[f] && !/^\d{4}-\d{2}-\d{2}$/.test(out[f])) {
      problems.push(`row ${lineNo}: bad ${f} "${out[f]}"`);
      out[f] = "";
    }
  }

  out.level = level;
  out.studentType = out.admissionDate === newDate ? "신입생" : "재학생";
  if (!out.enrollStatus) out.enrollStatus = "재학";
  if (!out.nationality) out.nationality = nationality;

  docs.push(out);
});

/* ------------------------------------------------------------------ report */
const newStudents = docs.filter((d) => d.studentType === "신입생").length;
const withMobile = docs.filter((d) => d.mobile).length;

const byNumber = new Map();
for (const d of docs) {
  if (!d.mobile) continue;
  byNumber.set(d.mobile, [...(byNumber.get(d.mobile) || []), d.studentId]);
}
const shared = [...byNumber.entries()].filter(([, ids]) => ids.length > 1);

console.log("\n-- Selection -----------------------------");
console.log(`  matched filter      ${docs.length}`);
console.log(`  excluded by filter  ${skippedFilter}`);
if (excludeTrack) console.log(`  excluded ${excludeTrack}   ${skippedTrack}`);
console.log(`  신입생 (${newDate})  ${newStudents}`);
console.log(`  재학생              ${docs.length - newStudents}`);
console.log(`  with mobile         ${withMobile}   (cannot log in: ${docs.length - withMobile})`);

if (shared.length) {
  console.log(`\n  ! ${shared.length} number(s) shared by more than one student.`);
  console.log("    Student login matches the first record found, so these students");
  console.log("    could reach each other's data until staff correct the numbers.");
  for (const [num, ids] of shared) {
    console.log(`      ${num.slice(0, 3)}****${num.slice(-4)}  ${ids.join(", ")}`);
  }
}

if (problems.length) {
  console.log(`\n  ! ${problems.length} issue(s) to check`);
  for (const p of problems.slice(0, 40)) console.log(`      ${p}`);
  if (problems.length > 40) console.log(`      ... and ${problems.length - 40} more`);
}

/* --------------------------------------------------------------- connect */
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

const ids = docs.map((d) => d.studentId);
const existing = await students.distinct("studentId", { studentId: { $in: ids } });
const existingSet = new Set(existing);

console.log("\n-- Database ------------------------------");
console.log(`  already present     ${existing.length}`);
console.log(`  to be inserted      ${docs.length - existing.length}`);
console.log(`  students now in DB  ${await students.countDocuments({})}`);

if (dryRun) {
  console.log("\n[dry-run] Nothing was written.");
  const flags = [
    `--level=${level}`,
    ...(excludeTrack ? [`--exclude-track=${excludeTrack}`] : []),
    ...(nationality === DEFAULTS.nationality ? [] : [`--nationality=${nationality}`]),
    ...(campus === DEFAULTS.campus ? [] : [`--campus=${campus}`]),
    ...(newDate === DEFAULTS.newDate ? [] : [`--new-date=${newDate}`]),
  ].join(" ");
  console.log(`To import:  node scripts/import-excel.mjs "${file}" ${flags} --mode=upsert\n`);
  await client.close();
  process.exit(0);
}

/* ---------------------------------------------------------------- backup */
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const count = await students.countDocuments({});
if (count > 0) {
  const backupName = `students_backup_${stamp}`;
  await students.aggregate([{ $match: {} }, { $out: backupName }]).toArray();
  console.log(`\nBackup collection ${backupName} (${count} docs)`);
}

/* ---------------------------------------------------------------- import */
if (mode === "replace") {
  const { deletedCount } = await students.deleteMany({});
  console.log(`Deleted ${deletedCount} existing students (portal passwords included)`);
}

// A student may have corrected nameKo/address/mobile via Profile — never let
// the import silently revert what they fixed.
const selfEditedById = new Map(
  (
    await students
      .find({ studentId: { $in: ids } }, { projection: { studentId: 1, selfEdited: 1 } })
      .toArray()
  ).map((d) => [d.studentId, d.selfEdited || {}])
);

const now = new Date();
const ops = docs
  .filter((d) => mode !== "insert-only" || !existingSet.has(d.studentId))
  .map((d) => {
    const $set = { updatedAt: now };
    const selfEdited = selfEditedById.get(d.studentId) || {};
    for (const f of ACADEMIC_FIELDS) {
      if (selfEdited[f]) continue;
      if (d[f] !== undefined && d[f] !== "") $set[f] = d[f];
    }
    // Fields the sheet left blank are skipped above so a re-import never wipes
    // what staff typed — but a brand new document still needs every key present,
    // since the Student type treats them all as strings.
    const blanks = {};
    for (const f of ACADEMIC_FIELDS) if (!(f in $set)) blanks[f] = "";

    return {
      updateOne: {
        filter: { studentId: d.studentId },
        update: {
          $set,
          $setOnInsert: {
            ...blanks,
            studentId: d.studentId,
            // 신입생/재학생 is staff-owned after the first import (domain.ts)
            studentType: d.studentType,
            tuition: { status: "미납", total: 0, term1: 0, term2: 0, term3: 0, term4: 0, note: "" },
            // shared/domain.ts 의 EMPTY_ATTENDANCE 와 같은 모양을 유지할 것 —
            // 이 필드가 빠지면 결석 구간 필터가 이 학생을 아예 찾지 못한다.
            attendance: {
              absences: 0,
              late: 0,
              absencesOffline: 0,
              absencesOnline: 0,
              lateOffline: 0,
              lateOnline: 0,
              riskAbsences: 0,
              note: "",
            },
            contactCount: 0,
            memo: "",
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

if (ops.length === 0) {
  console.log("\nNothing to write.");
} else {
  const res = await students.bulkWrite(ops, { ordered: false });
  console.log(`\nDone — inserted ${res.upsertedCount}, updated ${res.modifiedCount}`);
}
console.log(`Students now in DB ${await students.countDocuments({})}\n`);

await client.close();
