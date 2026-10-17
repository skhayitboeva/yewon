#!/usr/bin/env node
/**
 * Exports the students collection to an .xlsx file.
 * Usage: node scripts/export-students.mjs [output-path]
 */
import { MongoClient } from "mongodb";
import * as XLSX from "xlsx";
import path from "node:path";

const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB || "yewon_sms";
if (!URI) {
  console.error("MONGODB_URI 환경변수를 설정하세요.");
  process.exit(1);
}

const outPath = process.argv[2] || path.resolve("data", "students-export.xlsx");

const client = new MongoClient(URI);
await client.connect();
const db = client.db(DB);

const students = await db.collection("students").find({}).sort({ studentId: 1 }).toArray();
console.log(`학생 ${students.length}건 조회됨`);

const rows = students.map((s) => ({
  학번: s.studentId,
  과정: s.level,
  구분: s.studentType,
  한글명: s.nameKo,
  영문명: s.nameEn,
  생년월일: s.birthDate,
  성별: s.gender,
  학년: s.grade,
  학기: s.semesterNo,
  재적상태: s.enrollStatus,
  전공: s.major,
  학부: s.faculty,
  대학원: s.gradSchool,
  과정구분: s.course,
  입학일: s.admissionDate,
  입학구분: s.admissionType,
  국적: s.nationality,
  주소: s.address,
  전화: s.phone,
  휴대폰: s.mobile,
  이메일: s.email,
  최종등록연도: s.lastRegYear,
  최종등록학기: s.lastRegSemester,
  등록금상태: s.tuition?.status,
  등록금총액: s.tuition?.total,
  결석: s.attendance?.absences,
  지각: s.attendance?.late,
  상담횟수: s.consultCount ?? 0,
  연락횟수: s.contactCount,
  메모: s.memo,
}));

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "Students");
XLSX.writeFile(wb, outPath);

console.log(`엑셀 저장 완료: ${outPath}`);
await client.close();
