/** Shared between the React app and the Netlify Functions. */

export type Role = "admin" | "manager" | "user";

export const LEVELS = ["학부", "대학원"] as const;
export type Level = (typeof LEVELS)[number];

/** 신입생 / 재학생 — 담당자가 직접 선택한다. 입학일자로 자동 계산하지 않는다. */
export const STUDENT_TYPES = ["신입생", "재학생"] as const;
export type StudentType = (typeof STUDENT_TYPES)[number];

export const GENDERS = ["남", "여"] as const;
/** "삭제" is a soft-delete marker set by the table's delete button — the
 * student record is never actually removed from the database. */
export const ENROLL_STATUSES = ["재학", "휴학", "복학", "제적", "졸업", "자퇴", "삭제"] as const;
export const ADMISSION_TYPES = ["신입학", "편입학", "재입학"] as const;
export const COURSES = ["", "석사과정", "박사과정"] as const;

export const TUITION_STATUSES = ["완납", "부분납부", "미납"] as const;
export type TuitionStatus = (typeof TUITION_STATUSES)[number];

/** 상담 분야 — 요청서의 6종. */
export const CONSULT_CATEGORIES = [
  "등록금",
  "출석",
  "비자",
  "학업 관련(출석 포함)",
  "긴급",
  "기타",
] as const;
export type ConsultCategory = (typeof CONSULT_CATEGORIES)[number];

export const CONSULT_METHODS = ["대면", "전화", "카카오톡", "이메일", "기타"] as const;

/** 출결 구간 — 대시보드 카드와 표 필터가 같은 정의를 쓴다. */
export const ABSENCE_BUCKETS = [
  { key: "good", label: "양호 (0회)", min: 0, max: 0 },
  { key: "a1", label: "결석 1회", min: 1, max: 1 },
  { key: "a23", label: "결석 2–3회", min: 2, max: 3 },
  { key: "a4", label: "결석 4회 이상 (F 대상)", min: 4, max: null },
] as const;
export type AbsenceBucketKey = (typeof ABSENCE_BUCKETS)[number]["key"];

export interface Tuition {
  status: TuitionStatus;
  total: number;
  term1: number;
  term2: number;
  term3: number;
  term4: number;
  note: string;
}

export interface Attendance {
  absences: number;
  note: string;
}

export interface Student {
  _id: string;
  studentId: string;
  level: Level;
  studentType: StudentType;
  nameKo: string;
  nameEn: string;
  birthDate: string;
  gender: string;
  grade: string;
  semesterNo: string;
  enrollStatus: string;
  major: string;
  faculty: string;
  gradSchool: string;
  course: string;
  admissionDate: string;
  admissionType: string;
  nationality: string;
  address: string;
  phone: string;
  mobile: string;
  email: string;
  lastRegYear: string;
  lastRegSemester: string;
  tuition: Tuition;
  attendance: Attendance;
  contactCount: number;
  memo: string;
  consultCount?: number;
  /** Whether this student has self-set a portal login password. Never the hash itself. */
  hasPassword?: boolean;
  /** Fields the student has edited themselves via Profile — the Excel import
   * skips these so it doesn't silently revert a self-service edit. */
  selfEdited?: Partial<Record<"nameKo" | "address" | "mobile", boolean>>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Consultation {
  _id: string;
  studentId: string;
  date: string;
  categories: ConsultCategory[];
  method: string;
  content: string;
  result: string;
  counselor: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Settings {
  currentYear: number;
  currentSemester: 1 | 2;
}

export interface InfoItem {
  id: string;
  label: string;
  value: string;
}

export interface Info {
  tuitionDeadline: string;
  classTimeUndergraduate: string;
  classTimeGraduate: string;
  visaApplicationTime: string;
  orientation: string;
  /** Extra admin-defined boxes, added on top of the fixed fields above. */
  items: InfoItem[];
}

export const EMPTY_INFO: Info = {
  tuitionDeadline: "",
  classTimeUndergraduate: "",
  classTimeGraduate: "",
  visaApplicationTime: "",
  orientation: "",
  items: [],
};

export interface Stats {
  total: number;
  byLevelType: { level: string; studentType: string; count: number }[];
  tuitionStatus: Record<string, number>;
  terms: { term1: number; term2: number; term3: number; term4: number };
  tuitionSums: { billed: number; paid: number };
  absence: Record<AbsenceBucketKey, number>;
  cohorts: { cohort: string; level: string; count: number }[];
  consultByCategory: { category: string; records: number; students: number }[];
  recentConsults: {
    _id: string;
    studentId: string;
    nameKo: string;
    date: string;
    categories: string[];
    content: string;
  }[];
  settings: Settings;
}

export const EMPTY_TUITION: Tuition = {
  status: "미납",
  total: 0,
  term1: 0,
  term2: 0,
  term3: 0,
  term4: 0,
  note: "",
};

export const EMPTY_ATTENDANCE: Attendance = { absences: 0, note: "" };

/** 입학일자 → 입학 코호트 ("2026-2"). 표의 코호트 필터에만 쓰인다. */
export function cohortOf(admissionDate: string): string {
  if (!admissionDate || admissionDate.length < 7) return "";
  const year = admissionDate.slice(0, 4);
  const month = Number(admissionDate.slice(5, 7));
  if (!Number.isFinite(month) || month < 1) return "";
  return `${year}-${month >= 7 ? 2 : 1}`;
}

export function tuitionPaid(t: Tuition | undefined): number {
  if (!t) return 0;
  return (t.term1 || 0) + (t.term2 || 0) + (t.term3 || 0) + (t.term4 || 0);
}

export function formatKRW(n: number | undefined | null): string {
  if (!n) return "0";
  return new Intl.NumberFormat("ko-KR").format(n);
}
