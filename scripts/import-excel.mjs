#!/usr/bin/env node
/**
 * 엑셀(.xlsx) → MongoDB 이관.
 *
 *   node scripts/import-excel.mjs data/students.xlsx --dry-run
 *   node scripts/import-excel.mjs data/students.xlsx --mode=upsert
 *   node scripts/import-excel.mjs data/students.xlsx --mode=replace
 *
 * 기본은 --dry-run: 무엇이 바뀔지 리포트만 내고 아무것도 쓰지 않는다.
 * upsert 모드는 학적 정보만 갱신하고 등록금·출결·연락횟수·메모는 보존한다.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";

/* ------------------------------------------------------------- 컬럼 매핑 */
/** 엑셀 헤더(왼쪽) → DB 필드(오른쪽). 실제 파일을 보고 필요한 만큼 추가하세요. */
const HEADER_MAP = {
  학번: "studentId",
  성명: "nameKo",
  이름: "nameKo",
  "성명(영문)": "nameEn",
  영문성명: "nameEn",
  영문이름: "nameEn",
  생년월일: "birthDate",
  성별: "gender",
  학년: "grade",
  학기차: "semesterNo",
  학적: "enrollStatus",
  전공: "major",
  학부: "faculty",
  대학원: "gradSchool",
  과정: "course",
  입학일자: "admissionDate",
  입학구분: "admissionType",
  국적: "nationality",
  주소: "address",
  주소1: "address1",
  주소2: "address2",
  전화번호: "phone",
  휴대전화: "mobile",
  연락처: "mobile",
  이메일: "email",
  최근등록년도: "lastRegYear",
  최근등록학기: "lastRegSemester",
  구분: "level",
  "신입/재학": "studentType",
  신입재학: "studentType",
};

/** 엑셀에서 가져오는 필드 = 학적 정보. 등록금/출결/연락횟수/메모는 앱에서만 입력. */
const ACADEMIC_FIELDS = [
  "level",
  "studentType",
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

/* ---------------------------------------------------------------- helpers */
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const modeArg = args.find((a) => a.startsWith("--mode="));
const mode = modeArg ? modeArg.split("=")[1] : "upsert";
const dryRun = args.includes("--dry-run") || !args.some((a) => a.startsWith("--mode="));

if (!file) {
  console.error("사용법: node scripts/import-excel.mjs <파일.xlsx> [--dry-run|--mode=upsert|--mode=replace|--mode=insert-only]");
  process.exit(1);
}
if (!["upsert", "replace", "insert-only"].includes(mode)) {
  console.error(`알 수 없는 모드: ${mode}`);
  process.exit(1);
}

const clean = (v) => {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "0" || s === "-" || s.toUpperCase() === "N/A" ? "" : s;
};

/** 엑셀 날짜(숫자 시리얼 또는 문자열) → "YYYY-MM-DD". */
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

/* ------------------------------------------------------------------- 읽기 */
const wb = XLSX.read(readFileSync(file), { cellDates: false });
const sheetName = wb.SheetNames[0];
const rowsRaw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });

console.log(`\n파일: ${basename(file)}  시트: ${sheetName}  행: ${rowsRaw.length}`);

const headers = Object.keys(rowsRaw[0] || {});
const mapped = headers.filter((h) => HEADER_MAP[h.trim()]);
const unmapped = headers.filter((h) => !HEADER_MAP[h.trim()]);

console.log("\n── 컬럼 매핑 ─────────────────────────────");
for (const h of mapped) console.log(`  ✓ ${h.padEnd(16)} → ${HEADER_MAP[h.trim()]}`);
for (const h of unmapped) console.log(`  · ${h.padEnd(16)}   (무시됨)`);
if (unmapped.length) {
  console.log("\n  무시된 컬럼이 필요하면 scripts/import-excel.mjs 의 HEADER_MAP 에 추가하세요.");
}

/* ------------------------------------------------------------------ 변환 */
const problems = [];
const seen = new Map();
const docs = [];

rowsRaw.forEach((row, i) => {
  const lineNo = i + 2; // 헤더가 1행
  const out = {};
  for (const [header, value] of Object.entries(row)) {
    const field = HEADER_MAP[header.trim()];
    if (!field) continue;
    out[field] = field === "birthDate" || field === "admissionDate" ? toDate(value) : clean(value);
  }

  if (out.address1 || out.address2) {
    out.address = [out.address1, out.address2].filter(Boolean).join(" ").trim();
    delete out.address1;
    delete out.address2;
  }

  if (!out.studentId) {
    problems.push(`${lineNo}행: 학번 없음 — 건너뜀`);
    return;
  }
  if (seen.has(out.studentId)) {
    problems.push(`${lineNo}행: 학번 ${out.studentId} 중복 (${seen.get(out.studentId)}행과 같음)`);
    return;
  }
  seen.set(out.studentId, lineNo);

  if (!out.nameKo) problems.push(`${lineNo}행: 성명 없음 (${out.studentId})`);
  if (out.level && !["학부", "대학원"].includes(out.level)) {
    problems.push(`${lineNo}행: 구분 값이 "${out.level}" — 학부/대학원이 아님`);
  }
  if (!out.level) out.level = out.gradSchool ? "대학원" : "학부";
  if (!out.studentType) out.studentType = "재학생";
  if (!out.enrollStatus) out.enrollStatus = "재학";
  if (!out.nationality) out.nationality = "우즈베키스탄";
  for (const f of ["birthDate", "admissionDate"]) {
    if (out[f] && !/^\d{4}-\d{2}-\d{2}$/.test(out[f])) {
      problems.push(`${lineNo}행: ${f} 형식 오류 "${out[f]}"`);
      out[f] = "";
    }
  }

  docs.push(out);
});

/* --------------------------------------------------------------- 리포트 */
const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB || "yewon_sms";
if (!URI) {
  console.error("\nMONGODB_URI 환경변수를 설정하세요.");
  process.exit(1);
}

const client = new MongoClient(URI);
await client.connect();
const db = client.db(DB);
const students = db.collection("students");

const ids = docs.map((d) => d.studentId);
const existing = await students.distinct("studentId", { studentId: { $in: ids } });
const existingSet = new Set(existing);

console.log("\n── 검증 결과 ─────────────────────────────");
console.log(`  유효한 행        ${docs.length}`);
console.log(`  이미 있는 학번   ${existing.length}`);
console.log(`  새로 추가될 학번 ${docs.length - existing.length}`);
console.log(`  현재 DB 학생 수  ${await students.countDocuments({})}`);
if (problems.length) {
  console.log(`\n  ⚠ 확인 필요 ${problems.length}건`);
  for (const p of problems.slice(0, 40)) console.log(`    - ${p}`);
  if (problems.length > 40) console.log(`    … 외 ${problems.length - 40}건`);
}

if (dryRun) {
  console.log("\n[dry-run] 아무것도 저장하지 않았습니다.");
  console.log("실제 이관: node scripts/import-excel.mjs " + file + " --mode=upsert\n");
  await client.close();
  process.exit(0);
}

/* ---------------------------------------------------------------- 백업 */
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const backupName = `students_backup_${stamp}`;
const count = await students.countDocuments({});
if (count > 0) {
  await students.aggregate([{ $match: {} }, { $out: backupName }]).toArray();
  console.log(`\n백업 생성: ${backupName} (${count}건)`);
}

/* ---------------------------------------------------------------- 이관 */
if (mode === "replace") {
  // Also wipes every student's password and selfEdited protection — students
  // must set a new portal password after a --mode=replace import.
  const { deletedCount } = await students.deleteMany({});
  console.log(`기존 ${deletedCount}건 삭제 (학생 비밀번호·자가수정 보호 항목도 함께 삭제됨)`);
}

// A student may have edited nameKo/address/mobile themselves via Profile —
// don't let the Excel import silently revert those fields.
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
    return {
      updateOne: {
        filter: { studentId: d.studentId },
        update: {
          $set,
          $setOnInsert: {
            studentId: d.studentId,
            tuition: { status: "미납", total: 0, term1: 0, term2: 0, term3: 0, term4: 0, note: "" },
            attendance: { absences: 0, note: "" },
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
  console.log("\n처리할 행이 없습니다.");
} else {
  const res = await students.bulkWrite(ops, { ordered: false });
  console.log(`\n이관 완료 — 추가 ${res.upsertedCount}, 갱신 ${res.modifiedCount}`);
}
console.log(`현재 DB 학생 수 ${await students.countDocuments({})}\n`);

await client.close();
