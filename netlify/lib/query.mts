import type { Filter, Document } from "mongodb";
import { ABSENCE_BUCKETS } from "../../shared/domain.ts";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "2026-2" → matches admissionDate in the 2nd semester of 2026 (month >= 7). */
function cohortRegex(cohort: string): RegExp | null {
  const m = /^(\d{4})-([12])$/.exec(cohort);
  if (!m) return null;
  const [, year, sem] = m;
  return sem === "2"
    ? new RegExp(`^${year}-(0[7-9]|1[0-2])`)
    : new RegExp(`^${year}-(0[1-6])`);
}

export const SORTABLE_FIELDS = new Set([
  "studentId",
  "nameKo",
  "nameEn",
  "birthDate",
  "gender",
  "level",
  "studentType",
  "major",
  "faculty",
  "gradSchool",
  "grade",
  "semesterNo",
  "enrollStatus",
  "admissionType",
  "admissionDate",
  "address",
  "mobile",
  "email",
  "tuition.status",
  "tuition.total",
  "tuition.term1",
  "tuition.term2",
  "tuition.term3",
  "tuition.term4",
  "attendance.absences",
  "contactCount",
]);

export interface ListParams {
  filter: Filter<Document>;
  sort: Record<string, 1 | -1>;
  page: number;
  limit: number;
}

export function buildStudentQuery(url: URL): ListParams {
  const p = url.searchParams;
  const and: Filter<Document>[] = [];

  const q = (p.get("q") || "").trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    and.push({
      $or: [{ studentId: rx }, { nameKo: rx }, { nameEn: rx }, { mobile: rx }, { email: rx }],
    });
  }

  const eq: [string, string | null][] = [
    ["level", p.get("level")],
    ["studentType", p.get("studentType")],
    ["major", p.get("major")],
    ["enrollStatus", p.get("enrollStatus")],
    ["tuition.status", p.get("tuitionStatus")],
    ["admissionType", p.get("admissionType")],
  ];
  for (const [field, value] of eq) {
    if (value) and.push({ [field]: value });
  }

  const term = p.get("term");
  if (term && ["1", "2", "3", "4"].includes(term)) {
    and.push({ [`tuition.term${term}`]: { $gt: 0 } });
  }

  const absence = p.get("absence");
  if (absence) {
    const bucket = ABSENCE_BUCKETS.find((b) => b.key === absence);
    if (bucket) {
      const range: Record<string, number> = { $gte: bucket.min };
      if (bucket.max !== null) range.$lte = bucket.max;
      and.push({ "attendance.absences": range });
    }
  }

  const cohort = p.get("cohort");
  if (cohort) {
    const rx = cohortRegex(cohort);
    if (rx) and.push({ admissionDate: rx });
  }

  const sortField = p.get("sort") || "studentId";
  const dir = p.get("dir") === "desc" ? -1 : 1;
  const sort: Record<string, 1 | -1> = SORTABLE_FIELDS.has(sortField)
    ? { [sortField]: dir as 1 | -1 }
    : { studentId: 1 };
  if (sortField !== "studentId") sort.studentId = 1; // stable tiebreak

  const page = Math.max(1, Number(p.get("page")) || 1);
  const limitRaw = Number(p.get("limit")) || 50;
  const limit = Math.min(1000, Math.max(10, limitRaw));

  return { filter: and.length ? { $and: and } : {}, sort, page, limit };
}

/** Rebuilds the same filter from a plain object (used by the bulk endpoint). */
export function filterFromObject(obj: Record<string, string>): Filter<Document> {
  const url = new URL("https://x/");
  for (const [k, v] of Object.entries(obj)) {
    if (v) url.searchParams.set(k, v);
  }
  return buildStudentQuery(url).filter;
}
