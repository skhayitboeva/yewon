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

/** 대시보드 통계와 "전체 학생" 탭이 세는 학적. 복학은 바로 수업을 듣고 등록금도
 * 내므로 재학과 같이 센다. 나머지(휴학/제적/졸업/자퇴/삭제/빈 값)는 "기타" 탭으로
 * 간다 — 두 탭을 합치면 언제나 전체가 된다. 기준이 바뀌면 이 배열만 고치면 된다. */
export const ENROLLED_STATUSES = ["재학", "복학"] as const;

/** 학생 목록의 두 갈래 — 서버 쿼리(query.mts)와 클라이언트 필터(studentFilter.ts)가
 * 같은 값을 쓴다. */
export type StudentScope = "enrolled" | "others";

export function isEnrolled(enrollStatus: string | undefined | null): boolean {
  return (ENROLLED_STATUSES as readonly string[]).includes(enrollStatus ?? "");
}

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

/** 출결 구간 — 대시보드 카드와 표 필터가 같은 정의를 쓴다.
 * "전체" 모드에서는 riskAbsences(대면·온라인 중 큰 값) 기준이므로
 * a4 는 "어느 한 과목에서 4회 이상"을 뜻한다 — 두 과목 합계가 아니다. */
export const ABSENCE_BUCKETS = [
  { key: "good", label: "양호 (0회)", min: 0, max: 0 },
  { key: "a1", label: "결석 1회", min: 1, max: 1 },
  { key: "a2", label: "결석 2회", min: 2, max: 2 },
  { key: "a3", label: "결석 3회", min: 3, max: 3 },
  { key: "a4", label: "결석 4회 이상 (한 과목 기준, F 대상)", min: 4, max: null },
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

/** 주차별 출결(weekly_attendance)에서 계산해 학생 문서에 캐시하는 값들.
 * 필터·통계·정렬·CSV 가 전부 이 스칼라를 읽기 때문에 남겨 둔다.
 * note 를 제외하면 직접 쓰지 말 것 — attendanceTotals() 가 유일한 출처다. */
export interface Attendance {
  /** 대면 + 온라인 합계. 표에 보여 주는 값. */
  absences: number;
  late: number;
  absencesOffline: number;
  absencesOnline: number;
  lateOffline: number;
  lateOnline: number;
  /** max(대면, 온라인) — 결석 구간/통계/필터가 읽는 값. 아래 설명 참고. */
  riskAbsences: number;
  /** 손으로 입력하는 유일한 출결 필드. */
  note: string;
}

/* ------------------------------------------------------------- 주차별 출결 */

/** 한 학기는 16주. 그리드의 열 수이자 유효한 주차 범위. */
export const SEMESTER_WEEKS = 16;

/** 대면 수업은 매주, 온라인 수업은 월말에 한 번 집계된다. */
export const ATTENDANCE_MODES = ["offline", "online"] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

/** null = 출석(빈 칸). 칸을 누르면 이 순서로 순환한다. */
export type AttendanceMark = "absent" | "late" | null;

export function nextMark(mark: AttendanceMark): AttendanceMark {
  return mark === null ? "absent" : mark === "absent" ? "late" : null;
}

export interface WeekCells {
  offline: AttendanceMark;
  online: AttendanceMark;
}

/** 학생 한 명의 한 학기 기록. weeks 의 키는 "1"~"16" 문자열 —
 * 배열이 아니라 맵이어야 `weeks.7.offline` 한 칸만 $set 할 수 있다. */
export interface WeeklyAttendance {
  /** 학번 — consultations 와 같은 외래키. Mongo _id 가 아니다. */
  studentId: string;
  year: number;
  semester: 1 | 2;
  weeks: Record<string, WeekCells>;
  /** legacy-import = 옛 총계를 임시 주차에 배치한 문서. */
  source?: "manual" | "legacy-import" | "sheet-import";
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const WEEK_KEYS: string[] = Array.from({ length: SEMESTER_WEEKS }, (_, i) =>
  String(i + 1)
);

export function emptyWeeks(): Record<string, WeekCells> {
  return Object.fromEntries(WEEK_KEYS.map((k) => [k, { offline: null, online: null }]));
}

/** 저장된 문서에는 손댄 칸만 들어 있으므로 읽을 때 16주 전체로 채운다. */
export function normalizeWeeks(
  weeks?: Record<string, Partial<WeekCells>> | null
): Record<string, WeekCells> {
  const out = emptyWeeks();
  for (const k of WEEK_KEYS) {
    out[k] = { offline: weeks?.[k]?.offline ?? null, online: weeks?.[k]?.online ?? null };
  }
  return out;
}

export interface AttendanceTotals {
  offline: { absences: number; late: number };
  online: { absences: number; late: number };
  /** 표시용 합계. */
  absences: number;
  late: number;
  /** max(대면, 온라인). */
  riskAbsences: number;
}

/** 대면과 온라인은 담당 교수가 다른 별개 과목이라 따로 센다. 한 과목에서만
 * 4회여도 F 대상이므로 구간 판정은 합계가 아니라 둘 중 큰 값으로 한다.
 * 규칙이 바뀌면 오직 이 함수만 고치면 된다 — 학생 문서의 attendance.* 는
 * 이 결과의 캐시일 뿐이다. */
export function attendanceTotals(
  weeks?: Record<string, Partial<WeekCells>> | null
): AttendanceTotals {
  const per = {
    offline: { absences: 0, late: 0 },
    online: { absences: 0, late: 0 },
  };
  const full = normalizeWeeks(weeks);
  for (const k of WEEK_KEYS) {
    for (const mode of ATTENDANCE_MODES) {
      const mark = full[k][mode];
      if (mark === "absent") per[mode].absences += 1;
      else if (mark === "late") per[mode].late += 1;
    }
  }
  return {
    offline: per.offline,
    online: per.online,
    absences: per.offline.absences + per.online.absences,
    late: per.offline.late + per.online.late,
    riskAbsences: Math.max(per.offline.absences, per.online.absences),
  };
}

/** attendanceTotals() 결과를 학생 문서의 캐시 필드로 옮긴다. */
export function totalsToAttendanceFields(t: AttendanceTotals): Omit<Attendance, "note"> {
  return {
    absences: t.absences,
    late: t.late,
    absencesOffline: t.offline.absences,
    absencesOnline: t.online.absences,
    lateOffline: t.offline.late,
    lateOnline: t.online.late,
    riskAbsences: t.riskAbsences,
  };
}

/* ------------------------------------------------------------------- 반 배정 */

/** 반이 열리는 요일 — 시간표 정렬 순서이기도 하다. 대학원 출석명부에는 요일이
 * 없어서 day 가 "" 인 반이 있다. */
export const CLASS_DAYS = ["월", "화", "수", "목", "금"] as const;
export type ClassDay = (typeof CLASS_DAYS)[number];

/** 학사에서 받은 반배정·출석명부 한 장 = 반 하나. 수업 시각은 두 명부 어디에도
 * 없어서 요일 + 강의실까지만 담는다. */
export interface ClassGroup {
  _id: string;
  year: number;
  semester: 1 | 2;
  level: Level;
  name: string;
  /** 학부는 시트 이름에서 얻는다. 대학원 명부에는 요일이 없어 "". */
  day: ClassDay | "";
  room: string;
  /** 대학원만 — 엔터테인먼트경영 / 문화예술관광. */
  program: string;
  /** 영어트랙1반 · 편입 같은 시트 이름 접미사. */
  track: string;
  note: string;
  instructors: string[];
  /** 명부에 실린 전체 인원(타 국적 포함). 우리 학생 수는 따로 센다. */
  rosterCount: number;
  studentIds: string[];
  source: string;
  sheet: string;
  updatedAt?: string;
}

/** 우리가 가진 학생만 붙여서 돌려주는 모양 — /api/classes 의 응답. */
export interface ClassGroupWithStudents extends Omit<ClassGroup, "studentIds"> {
  students: {
    studentId: string;
    nameKo: string;
    nameEn: string;
    level: string;
    studentType: string;
    enrollStatus: string;
    mobile: string;
  }[];
  ourCount: number;
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
  /** Set once the student links their Telegram account via the Mini App. */
  telegramId?: string;
  telegramUsername?: string;
  telegramLinkedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Submitted from the Mini App by someone the phone-lookup couldn't find —
 * lets a student without a phone number on file get one added by an admin. */
export interface AccessRequest {
  _id: string;
  nameKo: string;
  birthDate: string;
  mobile: string;
  status: "pending" | "approved" | "rejected";
  candidates: Student[];
  createdAt: string;
  resolvedAt?: string;
  studentId?: string;
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
  /** 재학 중(ENROLLED_STATUSES)인 학생 수 — 아래 모든 통계의 모집단. */
  total: number;
  /** 그 밖의 학생 수(휴학·제적·졸업·자퇴·삭제·빈 값). 대시보드의 "기타" 카드 전용. */
  others: number;
  byLevelType: { level: string; studentType: string; count: number }[];
  tuitionStatus: Record<string, number>;
  terms: { term1: number; term2: number; term3: number; term4: number };
  tuitionSums: { billed: number; paid: number };
  /** all = riskAbsences(F 위험) 기준, offline/online 은 각 과목 결석 기준. */
  absence: Record<"all" | "offline" | "online", Record<AbsenceBucketKey, number>>;
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

export const EMPTY_ATTENDANCE: Attendance = {
  absences: 0,
  late: 0,
  absencesOffline: 0,
  absencesOnline: 0,
  lateOffline: 0,
  lateOnline: 0,
  riskAbsences: 0,
  note: "",
};

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
