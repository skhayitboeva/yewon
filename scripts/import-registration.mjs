#!/usr/bin/env node
/**
 * 등록현황 (registration status) workbooks -> students.tuition amounts + status.
 *
 *   node scripts/import-registration.mjs "대학원.xlsx" "학부.xlsx"
 *   node scripts/import-registration.mjs "대학원.xlsx" "학부.xlsx" --yes
 *
 * These are the registrar's per-semester 등록현황 sheets, which carry the real
 * billed amount and the per-installment payments. That makes them a different
 * shape from the 미등록 명단 that import-tuition.mjs reads — hence a separate
 * script. import-tuition.mjs promises never to touch total/term1..4; this one
 * exists precisely to write them.
 *
 * Read from the 등록금현황표 sheet: 학번 / 납입상태 / 고지금액 / 1~4차분 납부금액.
 *
 * `고지금액` (= 등록금액 − 교내장학금 − 교외장학금) becomes tuition.total, not
 * 등록금액 — it is what the student actually owes, so the app's paid-vs-total
 * comparison and 완납/부분납부 chips come out right for scholarship holders.
 *
 * Unlike import-tuition.mjs this does NOT filter by 국적. These sheets cover
 * every nationality the school enrolls; membership in our database is the only
 * criterion, so rows for students we don't track drop out on their own.
 *
 * tuition.note is never touched, no student is ever created or deleted, and
 * 학적 / enrollStatus is left to import-dismissals.mjs.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";

const SHEET = "등록금현황표";

/** Sheet wording -> the app's three statuses (shared/domain.ts TUITION_STATUSES). */
const STATUS_MAP = {
  미등록: "미납",
  미납: "미납",
  등록: "완납",
  완납: "완납",
  분납: "부분납부",
  부분납부: "부분납부",
};

/** The four installments the schema stores. */
const TERM_HEADERS = ["1차분", "2차분", "3차분", "4차분"];
/** Installments the sheet allows but the schema has no room for. A payment in
 * any of these means the 4-term assumption has broken and this script needs
 * revisiting rather than silently dropping money. */
const EXTRA_TERM_HEADERS = [
  "5차분", "6차분", "7차분", "8차분", "9차분", "10차분",
  "11차분", "12차분", "13차분", "14차분", "15차분",
];

/** Matches the `money` cap in netlify/lib/schema.mts. */
const MAX_AMOUNT = 9_999_999;

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const confirmed = args.includes("--yes");

if (files.length === 0) {
  console.error(
    'Usage: node scripts/import-registration.mjs "<file.xlsx>" [more.xlsx ...] [--yes]'
  );
  process.exit(1);
}

const cell = (v) => String(v ?? "").trim();
/** Sheet amounts arrive as numbers, but blank cells and the odd text entry
 * show up as strings — "1,150,000" included. */
const amount = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const n = Number(cell(v).replace(/[,\s₩]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/* -------------------------------------------------------------------- read */
const byId = new Map(); // 학번 -> { status, total, term1..4, from }
const conflicts = [];
const unmappedStatus = new Set();
const overCap = [];
const lateTerms = [];

for (const file of files) {
  const wb = XLSX.read(readFileSync(file), { cellDates: false });

  // Tolerate a stray trailing space in the sheet name — one of the two
  // workbooks ships "통장내역 " that way, so the tab names aren't trustworthy.
  const pick = wb.SheetNames.find((n) => cell(n) === SHEET);
  if (!pick) {
    console.error(
      `${basename(file)}: no "${SHEET}" sheet. Found: ${wb.SheetNames.join(" / ")}`
    );
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[pick], {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });

  // Find the header by content, not by a hard-coded row number — the title and
  // note rows above it have shifted between revisions of these files.
  const h = rows.findIndex((r) => r.some((c) => cell(c) === "학번"));
  if (h === -1) {
    console.error(`${basename(file)} / ${pick}: no 학번 header cell found.`);
    process.exit(1);
  }
  const header = rows[h];
  const at = (name) => header.findIndex((c) => cell(c) === name);

  const cId = at("학번");
  const cStatus = at("납입상태");
  const cTotal = at("고지금액");
  const cTerms = TERM_HEADERS.map(at);
  const cExtra = EXTRA_TERM_HEADERS.map(at).filter((i) => i !== -1);

  // Fail loudly on a missing column rather than quietly writing zeros over
  // real amounts.
  const missing = [
    ["납입상태", cStatus],
    ["고지금액", cTotal],
    ...TERM_HEADERS.map((n, i) => [n, cTerms[i]]),
  ].filter(([, i]) => i === -1);
  if (missing.length) {
    console.error(
      `${basename(file)} / ${pick}: missing column(s) ${missing.map(([n]) => n).join(", ")}`
    );
    process.exit(1);
  }

  // Each 차분 is a block of sub-columns (납부금액 / 납부일자 / 입금자명 / ...);
  // the 차분 header sits above the first of them, which is 납부금액.
  const data = rows.slice(h + 1).filter((r) => cell(r[cId]));

  console.log(`\n${basename(file)}`);
  console.log(`  sheet "${pick}"  header row ${h + 1}  rows with 학번 ${data.length}`);

  for (const row of data) {
    const id = cell(row[cId]);
    const raw = cell(row[cStatus]);
    const status = STATUS_MAP[raw];
    if (!status) {
      unmappedStatus.add(raw || "(blank)");
      continue;
    }

    const rec = {
      status,
      total: amount(row[cTotal]),
      from: basename(file),
    };
    cTerms.forEach((c, i) => {
      rec[`term${i + 1}`] = amount(row[c]);
    });

    for (const [field, value] of Object.entries(rec)) {
      if (typeof value === "number" && value > MAX_AMOUNT) {
        overCap.push(`${id}: ${field} ${value.toLocaleString()}`);
      }
    }
    for (const c of cExtra) {
      if (amount(row[c]) > 0) {
        lateTerms.push(`${id} (${cell(header[c])})`);
        break;
      }
    }

    const seen = byId.get(id);
    if (seen) {
      const differs = ["status", "total", "term1", "term2", "term3", "term4"].some(
        (k) => seen[k] !== rec[k]
      );
      if (differs) {
        conflicts.push(`${id}: ${seen.from} vs ${rec.from}`);
        continue;
      }
    }
    byId.set(id, rec);
  }
}

if (unmappedStatus.size) {
  console.error(`\n! Unrecognised 납입상태 value(s): ${[...unmappedStatus].join(", ")}`);
  console.error(`  Add them to STATUS_MAP in this script.`);
  process.exit(1);
}
if (overCap.length) {
  console.error(`\n! ${overCap.length} amount(s) above the ${MAX_AMOUNT.toLocaleString()} schema cap:`);
  for (const o of overCap.slice(0, 20)) console.error(`    ${o}`);
  process.exit(1);
}
if (lateTerms.length) {
  console.error(`\n! ${lateTerms.length} student(s) paid past 4차분, which tuition.term1..4 cannot hold:`);
  for (const l of lateTerms.slice(0, 20)) console.error(`    ${l}`);
  console.error(`  The schema needs extending before this file can be imported.`);
  process.exit(1);
}
if (conflicts.length) {
  console.error(`\n! ${conflicts.length} 학번 appearing twice with different figures — fix the sheets first:`);
  for (const c of conflicts) console.error(`    ${c}`);
  process.exit(1);
}

/* --------------------------------------------------------------- database */
const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB || "yewon_sms";
if (!URI) {
  console.error("\nSet MONGODB_URI first:  set -a && source .env && set +a");
  process.exit(1);
}

const FIELDS = ["status", "total", "term1", "term2", "term3", "term4"];

const client = new MongoClient(URI);
await client.connect();
const db = client.db(DB);
const students = db.collection("students");

const all = await students
  .find({}, { projection: { _id: 0, studentId: 1, tuition: 1 } })
  .toArray();
const current = new Map(all.map((d) => [d.studentId, d.tuition ?? {}]));

const listed = [...byId.keys()];
const matched = listed.filter((id) => current.has(id));
const unmatched = listed.filter((id) => !current.has(id));

/** Only the fields that actually differ, so a re-run writes nothing. */
const diffOf = (id) => {
  const t = current.get(id);
  const want = byId.get(id);
  return FIELDS.filter((f) =>
    f === "status" ? (t.status ?? "") !== want.status : (t[f] ?? 0) !== want[f]
  );
};
const toChange = matched.filter((id) => diffOf(id).length > 0);

const tally = (arr) =>
  JSON.stringify(arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {}));

console.log("\n-- Summary -------------------------------");
console.log(`  students in DB        ${all.length}`);
console.log(`  학번 in the sheets    ${listed.length}`);
console.log(`  matched by 학번       ${matched.length}`);
console.log(`  not in DB, skipped    ${unmatched.length}`);
console.log(`  in DB, not in sheets  ${all.filter((d) => !byId.has(d.studentId)).length}  (untouched)`);
console.log(`  to change             ${toChange.length}`);
console.log(`  status now            ${tally(all.map((d) => d.tuition?.status ?? "(none)"))}`);
console.log(`  status after          ${tally(all.map((d) => byId.get(d.studentId)?.status ?? d.tuition?.status ?? "(none)"))}`);

if (toChange.length) {
  console.log("\n-- Sample of changes ---------------------");
  for (const id of toChange.slice(0, 10)) {
    const t = current.get(id);
    const want = byId.get(id);
    const parts = diffOf(id).map((f) =>
      f === "status"
        ? `status ${t.status ?? "(none)"} -> ${want.status}`
        : `${f} ${(t[f] ?? 0).toLocaleString()} -> ${want[f].toLocaleString()}`
    );
    console.log(`  ${id}  ${parts.join(", ")}`);
  }
  if (toChange.length > 10) console.log(`  ... and ${toChange.length - 10} more`);
}

if (unmatched.length) {
  console.log(`\n-- 학번 not in our DB (${unmatched.length}, skipped) --`);
  console.log(`  ${unmatched.join(", ")}`);
}

if (!confirmed) {
  console.log("\n[report only] Nothing was written.");
  console.log("To apply:  add --yes\n");
  await client.close();
  process.exit(0);
}

/* Dotted $set paths keep the write surgical — same idea as flattenSet() in
 * netlify/lib/schema.mts — so tuition.note and every other field survive. */
const ops = toChange.map((id) => {
  const want = byId.get(id);
  const $set = { updatedAt: new Date() };
  for (const f of diffOf(id)) $set[`tuition.${f}`] = want[f];
  return { updateOne: { filter: { studentId: id }, update: { $set } } };
});

if (ops.length === 0) {
  console.log("\nAlready up to date — nothing to write.\n");
} else {
  const res = await students.bulkWrite(ops, { ordered: false });
  console.log(`\nDone — ${res.modifiedCount} student(s) updated.`);
  const after = await students
    .aggregate([{ $group: { _id: "$tuition.status", n: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    .toArray();
  console.log(`Tuition spread now ${JSON.stringify(Object.fromEntries(after.map((r) => [r._id, r.n])))}`);
  console.log(`Students in DB ${await students.countDocuments({})}\n`);
}

await client.close();
