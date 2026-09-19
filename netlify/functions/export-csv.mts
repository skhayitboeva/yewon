import type { Config } from "@netlify/functions";
import { COLLECTIONS, KO_COLLATION, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { handler, noStoreText } from "../lib/http.mts";
import { buildStudentQuery } from "../lib/query.mts";

const COLUMNS: [string, string][] = [
  ["studentId", "학번"],
  ["level", "구분"],
  ["studentType", "신입/재학"],
  ["nameKo", "성명"],
  ["nameEn", "성명(영문)"],
  ["birthDate", "생년월일"],
  ["gender", "성별"],
  ["faculty", "학부"],
  ["gradSchool", "대학원"],
  ["course", "과정"],
  ["major", "전공"],
  ["grade", "학년"],
  ["semesterNo", "학기차"],
  ["enrollStatus", "학적"],
  ["admissionType", "입학구분"],
  ["admissionDate", "입학일자"],
  ["nationality", "국적"],
  ["address", "주소"],
  ["mobile", "휴대전화"],
  ["phone", "전화번호"],
  ["email", "이메일"],
  ["tuition.status", "등록금 상태"],
  ["tuition.total", "등록금 총액"],
  ["tuition.term1", "1차"],
  ["tuition.term2", "2차"],
  ["tuition.term3", "3차"],
  ["tuition.term4", "4차"],
  ["tuition.note", "등록금 비고"],
  ["attendance.absences", "결석"],
  ["attendance.note", "출결 비고"],
  ["contactCount", "연락횟수"],
  ["memo", "메모"],
];

function get(obj: any, path: string): unknown {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default handler(async (req) => {
  await requireRole(req, ["admin"]);
  const url = new URL(req.url);
  const { filter, sort } = buildStudentQuery(url);

  const students = await coll(COLLECTIONS.students);
  const rows = await students.find(filter).collation(KO_COLLATION).sort(sort).toArray();

  const lines = [COLUMNS.map(([, label]) => csvCell(label)).join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map(([path]) => csvCell(get(row, path))).join(","));
  }

  // BOM so Excel on Windows reads the Korean headers as UTF-8.
  const body = "﻿" + lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return noStoreText(body, "text/csv; charset=utf-8", `학생목록_${stamp}.csv`);
});

export const config: Config = { path: "/api/export.csv" };
