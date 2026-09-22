/** Client-side equivalent of netlify/lib/query.mts's buildStudentQuery, run
 * against the full roster fetched once (see StudentsTable) instead of
 * round-tripping to Mongo on every keystroke. */
import { ABSENCE_BUCKETS, cohortOf, type Student, type Tuition } from "../../shared/domain";
import { getPath } from "../components/columns";

export function filterStudents(rows: Student[], filters: Record<string, string>): Student[] {
  const q = (filters.q || "").trim().toLowerCase();

  return rows.filter((s) => {
    if (q) {
      const haystacks = [s.studentId, s.nameKo, s.nameEn, s.mobile, s.email];
      if (!haystacks.some((v) => v?.toLowerCase().includes(q))) return false;
    }
    if (filters.level && s.level !== filters.level) return false;
    if (filters.studentType && s.studentType !== filters.studentType) return false;
    if (filters.major && s.major !== filters.major) return false;
    if (filters.enrollStatus && s.enrollStatus !== filters.enrollStatus) return false;
    if (filters.tuitionStatus && s.tuition?.status !== filters.tuitionStatus) return false;

    if (filters.term && ["1", "2", "3", "4"].includes(filters.term)) {
      const key = `term${filters.term}` as keyof Tuition;
      if (!(Number(s.tuition?.[key]) > 0)) return false;
    }

    if (filters.absence) {
      const bucket = ABSENCE_BUCKETS.find((b) => b.key === filters.absence);
      if (bucket) {
        const n = s.attendance?.absences ?? 0;
        if (n < bucket.min || (bucket.max !== null && n > bucket.max)) return false;
      }
    }

    if (filters.cohort && cohortOf(s.admissionDate) !== filters.cohort) return false;

    return true;
  });
}

const koCollator = new Intl.Collator("ko", { numeric: true });

export function sortStudents(rows: Student[], sortField: string, dir: string): Student[] {
  const mul = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = getPath(a, sortField);
    const bv = getPath(b, sortField);
    const cmp =
      typeof av === "number" || typeof bv === "number"
        ? (Number(av) || 0) - (Number(bv) || 0)
        : koCollator.compare(String(av ?? ""), String(bv ?? ""));
    // Stable tiebreak by student ID, matching the server's previous sort behavior.
    return cmp !== 0 ? cmp * mul : koCollator.compare(a.studentId, b.studentId);
  });
}

export function paginate<T>(rows: T[], page: number, limit: number): T[] {
  const start = (page - 1) * limit;
  return rows.slice(start, start + limit);
}
