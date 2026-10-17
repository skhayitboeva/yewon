#!/usr/bin/env node
/**
 * 제적자 명단 -> students.enrollStatus = "제적" (+ 사유를 memo 에 한 줄 추가).
 *
 *   node scripts/import-dismissals.mjs "제적자 명단.xlsx"
 *   node scripts/import-dismissals.mjs "제적자 명단.xlsx" --yes
 *
 * 명단은 학교 전체 기준이라 우리가 관리하지 않는 학생(한국인·타 국적)이 대부분이다.
 * 학번이 데이터베이스에 있는 학생만 바꾸고 나머지는 전부 건너뛴다. 학생을 새로
 * 만들지 않으며 등록금·출결은 건드리지 않는다.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";

/** Mirrors ENROLL_STATUSES in shared/domain.ts — kept literal so this script
 * has no TypeScript import, same as the other scripts here. */
const DISMISSED = "제적";

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const confirmed = args.includes("--yes");
const nationality = flag("nationality", "우즈베키스탄");

if (files.length !== 1) {
  console.error(
    'Usage: node scripts/import-dismissals.mjs "<file.xlsx>" [--nationality=우즈베키스탄] [--yes]'
  );
  process.exit(1);
}

const cell = (v) => String(v ?? "").trim();

/* -------------------------------------------------------------------- read */
const file = files[0];
const wb = XLSX.read(readFileSync(file), { cellDates: false });
const sheet = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
  header: 1,
  defval: "",
  raw: false,
  blankrows: true,
});

const h = rows.findIndex((r) => r.some((c) => cell(c) === "학번"));
if (h < 0) {
  console.error(`${basename(file)}: no row with a 학번 header.`);
  process.exit(1);
}
const header = rows[h];
const at = (name) => header.findIndex((c) => cell(c) === name);
const [cId, cName, cDate, cReason, cNote] = [
  at("학번"),
  at("성명"),
  at("제적처리일자"),
  at("사유"),
  at("비고"),
];

/** 명단 제목 줄(헤더 위)이 있으면 memo 출처로 쓴다. */
const title =
  rows
    .slice(0, h)
    .map((r) => cell(r[0]))
    .filter((v) => v.includes("제적자"))
    .pop() || basename(file);

const byId = new Map(); // 학번 -> { name, memoLine }
const duplicates = [];

for (const row of rows.slice(h + 1)) {
  const id = cell(row[cId]);
  if (!id) continue;
  const date = cDate >= 0 ? cell(row[cDate]) : "";
  const reason = cReason >= 0 ? cell(row[cReason]) : "";
  const entry = {
    name: cName >= 0 ? cell(row[cName]) : "",
    note: cNote >= 0 ? cell(row[cNote]) : "",
    memoLine: [date, reason, `(${title})`].filter(Boolean).join(" "),
  };
  if (byId.has(id)) {
    duplicates.push(id);
    continue;
  }
  byId.set(id, entry);
}

if (duplicates.length) {
  console.error(`\n! 명단에 중복된 학번 ${duplicates.length}건 — 시트를 먼저 정리하세요:`);
  console.error(`    ${duplicates.join(", ")}`);
  process.exit(1);
}

console.log(`\n${basename(file)}`);
console.log(`  sheet "${sheet}"  header row ${h + 1}`);
console.log(`  rows with 학번 ${byId.size}`);
console.log(`  memo 출처       ${title}`);

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

const all = await students
  .find(
    {},
    { projection: { _id: 0, studentId: 1, nameKo: 1, enrollStatus: 1, nationality: 1, memo: 1 } }
  )
  .toArray();
const current = new Map(all.map((d) => [d.studentId, d]));

const listed = [...byId.keys()];
const unmatched = listed.filter((id) => !current.has(id));
const matched = listed.filter((id) => current.has(id));

const wrongNationality = matched.filter((id) => cell(current.get(id).nationality) !== nationality);
const mine = matched.filter((id) => !wrongNationality.includes(id));
const alreadyDone = mine.filter((id) => current.get(id).enrollStatus === DISMISSED);
const toChange = mine.filter((id) => current.get(id).enrollStatus !== DISMISSED);

/** 기존 memo 를 지우지 않고 한 줄만 덧붙인다. 같은 줄이 이미 있으면 그대로 둔다 —
 * --yes 를 두 번 돌려도 중복되지 않는다. */
function nextMemo(doc, memoLine) {
  const memo = cell(doc.memo);
  if (!memoLine) return memo;
  if (memo.includes(memoLine)) return memo;
  return memo ? `${memo}\n${memoLine}` : memoLine;
}

const tally = (arr) => JSON.stringify(arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {}));

console.log("\n-- Summary -------------------------------");
console.log(`  students in DB        ${all.length}`);
console.log(`  on the 제적 list       ${listed.length}`);
console.log(`  matched by 학번       ${matched.length}`);
console.log(
  `  not in DB, skipped    ${unmatched.length}${unmatched.length ? "  " + unmatched.join(", ") : ""}`
);
console.log(`  already ${DISMISSED}          ${alreadyDone.length}`);
console.log(`  -> to change          ${toChange.length}`);
console.log(`  current spread        ${tally(all.map((d) => d.enrollStatus || "(none)"))}`);

if (wrongNationality.length) {
  console.log(`\n! 국적이 ${nationality} 가 아니어서 건너뜁니다 (${wrongNationality.length}건):`);
  for (const id of wrongNationality) {
    const d = current.get(id);
    console.log(`    ${id}  ${d.nameKo}  국적 ${d.nationality || "(none)"}`);
  }
}

if (toChange.length) {
  console.log("\n-- 바뀌는 학생 ---------------------------");
  for (const id of toChange) {
    const d = current.get(id);
    const e = byId.get(id);
    console.log(
      `    ${id}  ${d.nameKo || e.name}  ${d.enrollStatus || "(none)"} -> ${DISMISSED}   ${e.memoLine}`
    );
  }
}

if (!confirmed) {
  console.log("\n[report only] Nothing was written.");
  console.log("To apply:  add --yes\n");
  await client.close();
  process.exit(0);
}

const ops = toChange.map((id) => ({
  updateOne: {
    filter: { studentId: id },
    update: {
      $set: {
        enrollStatus: DISMISSED,
        memo: nextMemo(current.get(id), byId.get(id).memoLine),
        updatedAt: new Date(),
      },
    },
  },
}));

if (ops.length === 0) {
  console.log("\nAlready up to date — nothing to write.\n");
} else {
  const res = await students.bulkWrite(ops, { ordered: false });
  console.log(`\nDone — ${res.modifiedCount} student(s) updated.`);
  const after = await students
    .aggregate([{ $group: { _id: "$enrollStatus", n: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    .toArray();
  console.log(
    `enrollStatus spread now ${JSON.stringify(Object.fromEntries(after.map((r) => [r._id, r.n])))}`
  );
  console.log(
    `재학 중(재학+복학) ${await students.countDocuments({ enrollStatus: { $in: ["재학", "복학"] } })}` +
      `  /  전체 ${await students.countDocuments({})}\n`
  );
}

await client.close();
