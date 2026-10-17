#!/usr/bin/env node
/**
 * DB 초기화 — 모든 컬렉션을 비우고 인덱스를 다시 만듭니다.
 *
 *   node scripts/reset-db.mjs                     # 현재 상태만 출력 (삭제 안 함)
 *   node scripts/reset-db.mjs --yes               # 전부 삭제 + 인덱스 재생성
 *   node scripts/reset-db.mjs --yes --keep-config # settings·info 는 보존
 *
 * 삭제 전 .dev/backup/<시각>/ 에 전체 JSON 백업을 남깁니다.
 *
 * 직원 로그인(admin/manager)은 DB가 아니라 환경변수
 * APP_PASSWORD_HASH_ADMIN / APP_PASSWORD_HASH_MANAGER 에 있으므로
 * 이 스크립트의 영향을 받지 않습니다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB || "yewon_sms";
if (!URI) {
  console.error("MONGODB_URI 환경변수를 설정하세요:  set -a && source .env && set +a");
  process.exit(1);
}

const confirmed = process.argv.includes("--yes");
const keepConfig = process.argv.includes("--keep-config");
const CONFIG_COLLECTIONS = new Set(["settings", "info"]);

const client = new MongoClient(URI);
await client.connect();
const db = client.db(DB);

const names = (await db.listCollections().toArray())
  .map((c) => c.name)
  .filter((n) => !n.startsWith("system."))
  .sort();

console.log(`\nDB: ${db.databaseName}  (${URI.match(/@([^/?]+)/)?.[1] ?? "?"})`);
console.log("\n── 현재 상태 ─────────────────────────────");
let total = 0;
const counts = {};
for (const n of names) {
  counts[n] = await db.collection(n).countDocuments({});
  total += counts[n];
  const keep = keepConfig && CONFIG_COLLECTIONS.has(n);
  console.log(`  ${n.padEnd(20)}${String(counts[n]).padStart(6)} 건${keep ? "   (보존)" : ""}`);
}
console.log(`  ${"합계".padEnd(20)}${String(total).padStart(6)} 건`);

if (!confirmed) {
  console.log("\n[미실행] 아무것도 삭제하지 않았습니다.");
  console.log("실제 삭제:  node scripts/reset-db.mjs --yes\n");
  await client.close();
  process.exit(0);
}

/* ---------------------------------------------------------------- 백업 */
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = `.dev/backup/${stamp}`;
mkdirSync(dir, { recursive: true });
for (const n of names) {
  const docs = await db.collection(n).find({}).toArray();
  writeFileSync(`${dir}/${n}.json`, JSON.stringify(docs, null, 1));
}
console.log(`\n백업 완료 → ${dir}/  (${total}건)`);

/* ---------------------------------------------------------------- 삭제 */
console.log("\n── 삭제 ──────────────────────────────────");
for (const n of names) {
  if (keepConfig && CONFIG_COLLECTIONS.has(n)) {
    console.log(`  ${n.padEnd(20)}  건너뜀 (보존)`);
    continue;
  }
  const { deletedCount } = await db.collection(n).deleteMany({});
  console.log(`  ${n.padEnd(20)}${String(deletedCount).padStart(6)} 건 삭제`);
}

/* ------------------------------------------------------------ 인덱스 */
const students = db.collection("students");
await students.createIndex({ studentId: 1 }, { unique: true, name: "uniq_studentId" });
await students.createIndex({ level: 1, nameKo: 1 }, { name: "level_name" });
await students.createIndex({ studentType: 1 }, { name: "studentType" });
await students.createIndex({ major: 1 }, { name: "major" });
await students.createIndex({ "tuition.status": 1 }, { name: "tuition_status" });
await students.createIndex({ "attendance.absences": 1 }, { name: "absences" });
await students.createIndex({ "attendance.riskAbsences": 1 }, { name: "riskAbsences" });
await students.createIndex({ admissionDate: 1 }, { name: "admissionDate" });
await students.createIndex(
  { telegramId: 1 },
  { unique: true, sparse: true, name: "uniq_telegramId" }
);

const consultations = db.collection("consultations");
await consultations.createIndex({ studentId: 1, date: -1 }, { name: "student_date" });
await consultations.createIndex({ date: -1 }, { name: "date" });
await consultations.createIndex({ categories: 1 }, { name: "categories" });

const attempts = db.collection("login_attempts");
await attempts.createIndex({ at: 1 }, { expireAfterSeconds: 3600, name: "ttl_at" });
await attempts.createIndex({ ip: 1, at: -1 }, { name: "ip_at" });

const weeklyAttendance = db.collection("weekly_attendance");
await weeklyAttendance.createIndex(
  { studentId: 1, year: 1, semester: 1 },
  { unique: true, name: "uniq_student_term" }
);
await weeklyAttendance.createIndex({ year: 1, semester: 1 }, { name: "term" });

const classes = db.collection("classes");
await classes.createIndex({ year: 1, semester: 1 }, { name: "term" });
await classes.createIndex({ level: 1, day: 1, name: 1 }, { name: "level_day_name" });

const accessRequests = db.collection("access_requests");
await accessRequests.createIndex({ status: 1, createdAt: -1 }, { name: "status_createdAt" });

console.log("\n인덱스 재생성 완료");

/* -------------------------------------------------------------- 결과 */
console.log("\n── 결과 ──────────────────────────────────");
for (const n of names) {
  console.log(`  ${n.padEnd(20)}${String(await db.collection(n).countDocuments({})).padStart(6)} 건`);
}
console.log("\n직원 로그인(admin/manager)은 환경변수 기반이라 그대로 사용할 수 있습니다.");
console.log("다음 단계:  node scripts/import-excel.mjs <파일.xlsx> --dry-run\n");

await client.close();
