#!/usr/bin/env node
/**
 * Creates the indexes and loads data/students.seed.json.
 * Development data only — the real load is scripts/import-excel.mjs.
 *
 *   node scripts/seed.mjs             # upsert (keeps tuition/attendance edits)
 *   node scripts/seed.mjs --replace   # wipe students first
 */
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB || "yewon_sms";
if (!URI) {
  console.error("MONGODB_URI 환경변수를 설정하세요. 예:");
  console.error('  MONGODB_URI="mongodb+srv://..." node scripts/seed.mjs');
  process.exit(1);
}

const replace = process.argv.includes("--replace");

const client = new MongoClient(URI);
await client.connect();
const db = client.db(DB);

/* ---------------------------------------------------------------- indexes */
const students = db.collection("students");
await students.createIndex({ studentId: 1 }, { unique: true, name: "uniq_studentId" });
await students.createIndex({ level: 1, nameKo: 1 }, { name: "level_name" });
await students.createIndex({ studentType: 1 }, { name: "studentType" });
await students.createIndex({ major: 1 }, { name: "major" });
await students.createIndex({ "tuition.status": 1 }, { name: "tuition_status" });
await students.createIndex({ "attendance.absences": 1 }, { name: "absences" });
await students.createIndex({ admissionDate: 1 }, { name: "admissionDate" });

const consultations = db.collection("consultations");
await consultations.createIndex({ studentId: 1, date: -1 }, { name: "student_date" });
await consultations.createIndex({ date: -1 }, { name: "date" });
await consultations.createIndex({ categories: 1 }, { name: "categories" });

const attempts = db.collection("login_attempts");
await attempts.createIndex({ at: 1 }, { expireAfterSeconds: 3600, name: "ttl_at" });
await attempts.createIndex({ ip: 1, at: -1 }, { name: "ip_at" });

console.log("인덱스 생성 완료");

/* ------------------------------------------------------------------- data */
const raw = JSON.parse(
  await readFile(new URL("../data/students.seed.json", import.meta.url), "utf8")
);

if (replace) {
  const { deletedCount } = await students.deleteMany({});
  console.log(`기존 학생 ${deletedCount}건 삭제`);
}

const now = new Date();
const ops = raw.map((s) => ({
  updateOne: {
    filter: { studentId: s.studentId },
    update: {
      // Never clobber what staff typed in the app.
      $set: {
        level: s.level,
        nameKo: s.nameKo,
        nameEn: s.nameEn,
        birthDate: s.birthDate,
        gender: s.gender,
        grade: s.grade,
        semesterNo: s.semesterNo,
        enrollStatus: s.enrollStatus,
        major: s.major,
        faculty: s.faculty,
        gradSchool: s.gradSchool,
        course: s.course,
        admissionDate: s.admissionDate,
        admissionType: s.admissionType,
        nationality: s.nationality,
        address: s.address,
        phone: s.phone,
        mobile: s.mobile,
        email: s.email,
        lastRegYear: s.lastRegYear,
        lastRegSemester: s.lastRegSemester,
        updatedAt: now,
      },
      $setOnInsert: {
        studentId: s.studentId,
        studentType: "재학생",
        tuition: s.tuition,
        attendance: s.attendance,
        contactCount: 0,
        memo: "",
        createdAt: now,
      },
    },
    upsert: true,
  },
}));

const res = await students.bulkWrite(ops, { ordered: false });
console.log(`학생 ${raw.length}건 처리 — 추가 ${res.upsertedCount}, 갱신 ${res.modifiedCount}`);

await db
  .collection("settings")
  .updateOne(
    { _id: "app" },
    { $setOnInsert: { currentYear: 2026, currentSemester: 2 } },
    { upsert: true }
  );

console.log("완료");
await client.close();
