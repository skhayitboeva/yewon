import type { Config } from "@netlify/functions";
import { COLLECTIONS, KO_COLLATION, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { handler, noStoreText } from "../lib/http.mts";
import { buildStudentQuery } from "../lib/query.mts";

const DEFAULT_COLUMNS: [string, string][] = [
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
  ["attendance.lateOffline", "지각(대면)"],
  ["attendance.absencesOffline", "결석(대면)"],
  ["attendance.lateOnline", "지각(온라인)"],
  ["attendance.absencesOnline", "결석(온라인)"],
  ["attendance.late", "지각(합계)"],
  ["attendance.absences", "결석(합계)"],
  ["attendance.riskAbsences", "결석(F 위험, 한 과목 기준)"],
  ["attendance.note", "출결 비고"],
  ["contactCount", "연락횟수"],
  ["memo", "메모"],
];

/** Maps a students-table column key (src/components/columns.ts's COLUMNS)
 * to the CSV field(s) it stands for — some table columns (e.g. "tuition")
 * fold several document fields into one cell, so export writes one column
 * per underlying field instead of trying to squeeze them into one. */
const COLUMN_GROUPS: Record<string, [string, string][]> = {
  studentId: [["studentId", "학번"]],
  nameEn: [["nameEn", "성명(영문)"]],
  nameKo: [["nameKo", "성명"]],
  birthDate: [["birthDate", "생년월일"]],
  gender: [["gender", "성별"]],
  level: [["level", "구분"]],
  studentType: [["studentType", "신입/재학"]],
  faculty: [["faculty", "학부"]],
  gradSchool: [["gradSchool", "대학원"]],
  course: [["course", "과정"]],
  major: [["major", "전공"]],
  grade: [["grade", "학년"]],
  semesterNo: [["semesterNo", "학기차"]],
  enrollStatus: [["enrollStatus", "학적"]],
  admissionType: [["admissionType", "입학구분"]],
  admissionDate: [["admissionDate", "입학일자"]],
  address: [["address", "주소"]],
  mobile: [["mobile", "휴대전화"]],
  phone: [["phone", "전화번호"]],
  email: [["email", "이메일"]],
  tuition: [
    ["tuition.status", "등록금 상태"],
    ["tuition.total", "등록금 총액"],
    ["tuition.term1", "1차"],
    ["tuition.term2", "2차"],
    ["tuition.term3", "3차"],
    ["tuition.term4", "4차"],
    ["tuition.note", "등록금 비고"],
  ],
  late: [["attendance.late", "지각(합계)"]],
  absences: [["attendance.absences", "결석(합계)"]],
  absencesOffline: [["attendance.absencesOffline", "결석(대면)"]],
  absencesOnline: [["attendance.absencesOnline", "결석(온라인)"]],
  contactCount: [["contactCount", "연락횟수"]],
  memo: [["memo", "메모"]],
};

/** `cols` (comma-separated table column keys) picks and orders the export's
 * columns; omitted or unrecognized entirely falls back to every field. */
function resolveColumns(colsParam: string | null): [string, string][] {
  if (!colsParam) return DEFAULT_COLUMNS;
  const keys = colsParam.split(",").map((k) => k.trim()).filter(Boolean);
  const resolved = keys.flatMap((k) => COLUMN_GROUPS[k] ?? []);
  return resolved.length ? resolved : DEFAULT_COLUMNS;
}

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
  const columns = resolveColumns(url.searchParams.get("cols"));

  const students = await coll(COLLECTIONS.students);
  const rows = await students.find(filter).collation(KO_COLLATION).sort(sort).toArray();

  const lines = [columns.map(([, label]) => csvCell(label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map(([path]) => csvCell(get(row, path))).join(","));
  }

  // BOM so Excel on Windows reads the Korean headers as UTF-8.
  const body = "﻿" + lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return noStoreText(body, "text/csv; charset=utf-8", `학생목록_${stamp}.csv`);
});

export const config: Config = { path: "/api/export.csv" };
