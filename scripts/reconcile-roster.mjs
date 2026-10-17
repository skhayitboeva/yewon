#!/usr/bin/env node
/**
 * 학사시스템 명부(.xlsx) <-> students 대조. **아무것도 쓰지 않는다** — 보고하고
 * CSV 두 개만 남긴다.
 *
 *   node scripts/reconcile-roster.mjs "학부.xlsx" "대학원.xlsx"
 *
 * 우리 학생의 정의는 본분교 + 국적이다(기본 경기드림캠퍼스 / 우즈베키스탄).
 * 국적 열은 엑셀에서 숨겨져 있을 수 있지만 데이터에는 있다. 본분교는 학부 파일에서
 * J 열, 대학원 파일에서 H 열이라 열 위치가 아니라 **헤더 이름**으로 찾는다.
 *
 * 명부에는 재학생만 실리므로, 휴학·제적·자퇴·삭제 학생이 명부에 없는 것은
 * 정상이다. 그래서 이 스크립트는 학적을 바꾸지 않고 사람이 확인할 목록만 만든다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";

const DEFAULTS = {
  nationality: "우즈베키스탄",
  campus: "경기드림캠퍼스",
  /** 대학원 명부에만 있는 트랙. 다른 팀이 관리해서 우리 DB 에는 넣지 않는다
   * (scripts/import-excel.mjs 의 --exclude-track 과 같은 뜻). */
  excludeTrack: "근로자트랙",
  /** 받은 명부가 있는 곳 옆에 떨어뜨린다 — 엑셀로 바로 열어 보는 파일이라
   * 저장소 안(data/)보다 여기가 찾기 쉽다. */
  out: join(homedir(), "Downloads"),
};

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const nationality = flag("nationality", DEFAULTS.nationality);
const campus = flag("campus", DEFAULTS.campus);
const excludeTrack = flag("exclude-track", DEFAULTS.excludeTrack);
const outDir = flag("out", DEFAULTS.out);

if (files.length === 0) {
  console.error(
    'Usage: node scripts/reconcile-roster.mjs "<file.xlsx>" [more.xlsx ...] [--out=~/Downloads]\n' +
      "       [--nationality=우즈베키스탄] [--campus=경기드림캠퍼스] [--exclude-track=근로자트랙]"
  );
  process.exit(1);
}

/** import-excel.mjs 와 같은 규칙 — 헤더 안의 줄바꿈을 지우고 비교한다. */
const normHeader = (h) => String(h).replace(/[\r\n]+/g, "").trim();
const cell = (v) => String(v ?? "").trim();

/* -------------------------------------------------------------------- read */
/** 필터를 통과한 학생(= 우리 학생) */
const roster = new Map();
/** 두 파일의 모든 행 — 국적·캠퍼스가 우리 기준과 다른 학생을 찾아내는 데 쓴다. */
const anyRow = new Map();
const excluded = [];

for (const file of files) {
  const wb = XLSX.read(readFileSync(file), { cellDates: false });
  const sheet = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  const header = (rows[0] || []).map(normHeader);
  const at = (name) => header.indexOf(name);
  const ix = {
    id: at("학번"),
    nameKo: at("성명"),
    nameEn: at("성명(영문)"),
    birth: at("생년월일"),
    campus: at("본분교"),
    nationality: at("학생주소|국적"),
    status: at("학적"),
    exam: at("입학정보|수험번호"),
    mobile: at("학생주소|휴대전화"),
    tel: at("학생주소|전화번호"),
    /** 대학원 명부에서 트랙이 들어 있는 열 — 헤더 이름이 "외국인여부"다. */
    track: at("입학정보|외국인여부"),
  };
  if (ix.id < 0 || ix.campus < 0 || ix.nationality < 0) {
    console.error(`${basename(file)}: 학번 / 본분교 / 학생주소|국적 헤더를 찾지 못했습니다.`);
    process.exit(1);
  }

  let mine = 0;
  let skippedTrack = 0;
  for (const r of rows.slice(1)) {
    const id = cell(r[ix.id]);
    if (!id) continue;
    const rec = {
      file: basename(file),
      id,
      nameKo: cell(r[ix.nameKo]),
      nameEn: cell(r[ix.nameEn]),
      birth: cell(r[ix.birth]),
      campus: cell(r[ix.campus]),
      nationality: cell(r[ix.nationality]),
      status: cell(r[ix.status]),
      exam: ix.exam >= 0 ? cell(r[ix.exam]) : "",
      phone: [cell(r[ix.mobile]), cell(r[ix.tel])].filter(Boolean).join("/"),
      track: ix.track >= 0 ? cell(r[ix.track]) : "",
    };
    anyRow.set(id, rec);
    if (rec.campus !== campus || rec.nationality !== nationality) continue;
    if (excludeTrack && rec.track === excludeTrack) {
      excluded.push(rec);
      skippedTrack++;
      continue;
    }
    roster.set(id, rec);
    mine++;
  }
  console.log(
    `\n${basename(file)}  sheet "${sheet}"  rows ${rows.length - 1}` +
      `  |  ${campus} + ${nationality}: ${mine}` +
      (skippedTrack ? `  (${excludeTrack} ${skippedTrack} 제외)` : "")
  );
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
const students = client.db(DB).collection("students");
const docs = await students
  .find(
    {},
    {
      projection: {
        _id: 0,
        studentId: 1,
        nameKo: 1,
        nameEn: 1,
        birthDate: 1,
        mobile: 1,
        phone: 1,
        level: 1,
        enrollStatus: 1,
      },
    }
  )
  .toArray();
const db = new Map(docs.map((d) => [d.studentId, d]));

const ENROLLED = ["재학", "복학"]; // ENROLLED_STATUSES in shared/domain.ts
const toAdd = [...roster.values()].filter((r) => !db.has(r.id));
const notOnRoster = docs.filter((d) => !roster.has(d.studentId));
const conflicts = docs.filter(
  (d) => roster.has(d.studentId) && !ENROLLED.includes(d.enrollStatus)
);

const tally = (arr) => JSON.stringify(arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {}));

console.log("\n-- Summary -------------------------------");
console.log(`  roster (우리 학생)     ${roster.size}`);
console.log(`  students in DB        ${docs.length}`);
console.log(`  in both               ${roster.size - toAdd.length}`);
console.log(`  on roster, not in DB  ${toAdd.length}`);
if (excludeTrack) console.log(`  ${excludeTrack} 제외        ${excluded.length}`);
console.log(`  in DB, not on roster  ${notOnRoster.length}   ${tally(notOnRoster.map((d) => d.enrollStatus || "(none)"))}`);
console.log(`  status conflicts      ${conflicts.length}`);

if (toAdd.length) {
  console.log("\n-- 명부에 있고 DB 에 없음 (추가 대상) -----");
  for (const r of toAdd) {
    console.log(`    ${r.id}  ${r.nameKo}  ${r.nameEn}${r.track ? `  [${r.track}]` : ""}`);
  }
  console.log("  추가는 import-excel.mjs 가 전담한다 (필드 매핑·자기수정 보호·백업):");
  console.log('    node scripts/import-excel.mjs "<파일>" --level=학부 --mode=insert-only');
}

if (excluded.length) {
  console.log(`\n-- ${excludeTrack} (명부에 있으나 우리 관리 대상 아님) --`);
  for (const r of excluded) console.log(`    ${r.id}  ${r.nameKo}  ${r.nameEn}`);
}

/* -------------------------------------------------------------------- CSV */
/** netlify/functions/export-csv.mts 의 csvCell 과 같은 규칙. */
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** BOM 을 넣어야 윈도 엑셀이 한글 헤더를 UTF-8 로 읽는다. */
const writeCsv = (path, header, rows) => {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  writeFileSync(path, "\ufeff" + body + "\r\n", "utf8");
  console.log(`    ${path}   ${rows.length} row(s)`);
};

/** 명부 어딘가에 있으면 캠퍼스·수험번호를 거기서 가져온다 — 우리 스키마에는
 * 두 필드가 없어서(shared/domain.ts) 그 밖에는 채울 데이터가 없다. */
const fileSide = (id) => anyRow.get(id);
const rosterNote = (id) => {
  const f = fileSide(id);
  return f ? `명부: ${f.campus} / ${f.nationality} / ${f.status}${f.track ? ` / ${f.track}` : ""}` : "명부 없음";
};
const row = (d) => {
  const f = fileSide(d.studentId);
  return [
    d.studentId,
    d.nameKo || "",
    d.nameEn || f?.nameEn || "",
    f?.campus || "",
    (d.birthDate || f?.birth || "").slice(0, 4),
    d.mobile || d.phone || f?.phone || "",
    f?.exam || "",
    d.enrollStatus || "",
    rosterNote(d.studentId),
  ];
};

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const HEADER = [
  "학번",
  "성명",
  "nameEnglish",
  "campus",
  "birthYear",
  "phoneNumber",
  "수험번호",
  "enrollStatus(DB)",
  "명부상태",
];

console.log("\n-- CSV -----------------------------------");
writeCsv(join(outDir, `명부미등재_${stamp}.csv`), HEADER, notOnRoster.map(row));
writeCsv(
  join(outDir, `명부불일치_${stamp}.csv`),
  [...HEADER.slice(0, 8), "명부학적", HEADER[8]],
  conflicts.map((d) => {
    const r = row(d);
    return [...r.slice(0, 8), fileSide(d.studentId)?.status || "", r[8]];
  })
);

console.log("\n[read-only] 데이터베이스는 전혀 수정하지 않았습니다.\n");
await client.close();
