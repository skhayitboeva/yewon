#!/usr/bin/env node
/**
 * 미등록 명단 -> students.tuition.status / students.tuition.note.
 *
 *   node scripts/import-tuition.mjs "학부.xlsx" "대학원.xlsx" --rest=완납
 *   node scripts/import-tuition.mjs "학부.xlsx" "대학원.xlsx" --rest=완납 --yes
 *
 * The sheets list who has NOT registered. With --rest, every student in the
 * database who is absent from all the given files is set to that status —
 * which is how "everyone not on the list has paid" gets expressed.
 *
 * Only 학번 / 국적 / 납입상태 / 현황 are read. tuition.total and term1..4 are
 * never touched, and no student is ever created.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";

/** Mirrors TUITION_STATUSES in shared/domain.ts — kept literal so this script
 * has no TypeScript import, same as the other scripts here. */
const TUITION_STATUSES = ["완납", "부분납부", "미납"];

/** Sheet wording -> the app's three statuses. */
const STATUS_MAP = {
  미등록: "미납",
  미납: "미납",
  등록: "완납",
  완납: "완납",
  분납: "부분납부",
  부분납부: "부분납부",
};

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const confirmed = args.includes("--yes");
const nationality = flag("nationality", "우즈베키스탄");
const rest = flag("rest", "");

if (files.length === 0) {
  console.error(
    'Usage: node scripts/import-tuition.mjs "<file.xlsx>" [more.xlsx ...] [--rest=완납]\n' +
      "       [--nationality=우즈베키스탄] [--yes]"
  );
  process.exit(1);
}
if (rest && !TUITION_STATUSES.includes(rest)) {
  console.error(`--rest must be one of ${TUITION_STATUSES.join(" / ")} — got "${rest}"`);
  process.exit(1);
}

const cell = (v) => String(v ?? "").trim();

/* -------------------------------------------------------------------- read */
const byId = new Map(); // 학번 -> { status, note, from }
const conflicts = [];
const unmappedStatus = new Set();

for (const file of files) {
  const wb = XLSX.read(readFileSync(file), { cellDates: false });

  // The consolidated sheet is the deduplicated union of the other two.
  const pick =
    wb.SheetNames.find((n) => n.includes("취합")) ??
    wb.SheetNames.find((n) => {
      const r = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true });
      return r.some((row) => row.some((c) => cell(c) === "전공"));
    });
  if (!pick) {
    console.error(`${basename(file)}: no sheet with a 전공 header.`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[pick], {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });
  const h = rows.findIndex((r) => r.some((c) => cell(c) === "전공"));
  const header = rows[h];
  const at = (name) => header.findIndex((c) => cell(c) === name);
  const [cId, cNat, cStatus, cNote] = [at("학번"), at("국적"), at("납입상태"), at("현황")];

  const data = rows.slice(h + 1).filter((r) => cell(r[cId]));
  const mine = data.filter((r) => cell(r[cNat]) === nationality);

  console.log(`\n${basename(file)}`);
  console.log(`  sheet "${pick}"  header row ${h + 1}`);
  console.log(`  rows with 학번 ${data.length}   ${nationality} ${mine.length}`);

  for (const row of mine) {
    const id = cell(row[cId]);
    const raw = cell(row[cStatus]);
    const status = STATUS_MAP[raw];
    if (!status) {
      unmappedStatus.add(raw || "(blank)");
      continue;
    }
    const note = cell(row[cNote]);
    const seen = byId.get(id);
    if (seen && seen.status !== status) {
      conflicts.push(`${id}: ${seen.status} (${seen.from}) vs ${status} (${basename(file)})`);
      continue;
    }
    byId.set(id, { status, note, from: basename(file) });
  }
}

if (unmappedStatus.size) {
  console.error(`\n! Unrecognised 납입상태 value(s): ${[...unmappedStatus].join(", ")}`);
  console.error(`  Add them to STATUS_MAP in this script.`);
  process.exit(1);
}
if (conflicts.length) {
  console.error(`\n! ${conflicts.length} 학번 with conflicting 납입상태 — fix the sheets first:`);
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

const listedOps = matched.filter((id) => {
  const t = current.get(id);
  return t.status !== byId.get(id).status || (t.note ?? "") !== byId.get(id).note;
});

const restIds = rest
  ? all.map((d) => d.studentId).filter((id) => !byId.has(id) && current.get(id).status !== rest)
  : [];

const tally = (arr) =>
  JSON.stringify(arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {}));

console.log("\n-- Summary -------------------------------");
console.log(`  students in DB        ${all.length}`);
console.log(`  on the 미등록 lists   ${listed.length}`);
console.log(`  matched by 학번       ${matched.length}`);
console.log(`  not in DB, skipped    ${unmatched.length}${unmatched.length ? "  " + unmatched.join(", ") : ""}`);
console.log(`  listed -> to change   ${listedOps.length}   ${tally(matched.map((id) => byId.get(id).status))}`);
if (rest) console.log(`  rest -> ${rest}         ${restIds.length}`);
console.log(`  current spread        ${tally(all.map((d) => d.tuition?.status ?? "(none)"))}`);

if (!confirmed) {
  console.log("\n[report only] Nothing was written.");
  console.log(`To apply:  add --yes\n`);
  await client.close();
  process.exit(0);
}

const ops = [
  ...listedOps.map((id) => ({
    updateOne: {
      filter: { studentId: id },
      update: {
        $set: {
          "tuition.status": byId.get(id).status,
          "tuition.note": byId.get(id).note,
          updatedAt: new Date(),
        },
      },
    },
  })),
  ...restIds.map((id) => ({
    updateOne: {
      filter: { studentId: id },
      update: { $set: { "tuition.status": rest, updatedAt: new Date() } },
    },
  })),
];

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
