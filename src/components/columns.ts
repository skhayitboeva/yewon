import {
  ADMISSION_TYPES,
  ENROLL_STATUSES,
  GENDERS,
  LEVELS,
  STUDENT_TYPES,
} from "../../shared/domain";

export type ColumnKind = "text" | "number" | "date" | "select" | "tuition" | "consult";

export interface ColumnDef {
  key: string;
  label: string;
  /** English override — most columns fall back to the shared i18n dictionary
   * (see `Dashboard`/`Filters`), but a few Korean labels here ("학부",
   * "대학원") mean something different than the same words used as LEVELS
   * values, so those need an explicit, unambiguous English label. */
  labelEn: string;
  /** Dot path into the student document; also the sort field. */
  field: string;
  kind: ColumnKind;
  options?: readonly string[];
  width: number;
  sortable: boolean;
  /** Shown before the user opens the column menu. */
  defaultVisible: boolean;
  align?: "left" | "right";
  sticky?: boolean;
}

/** Every column shares this width, except the overrides called out below. */
const BASE_WIDTH = 140;
/** English Name and Tuition get double the base width. */
const DOUBLE_WIDTH = BASE_WIDTH * 2;
/** Address gets 70% of the double width — narrower than most columns, since
 * the full value is still reachable via inline edit. */
const ADDRESS_WIDTH = Math.round(DOUBLE_WIDTH * 0.7);

export const COLUMNS: ColumnDef[] = [
  { key: "studentId", label: "학번", labelEn: "Student ID", field: "studentId", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: true, sticky: true },
  { key: "nameEn", label: "성명(영문)", labelEn: "Name (English)", field: "nameEn", kind: "text", width: DOUBLE_WIDTH, sortable: true, defaultVisible: true, sticky: true },
  { key: "nameKo", label: "성명", labelEn: "Name", field: "nameKo", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "birthDate", label: "생년월일", labelEn: "Date of Birth", field: "birthDate", kind: "date", width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "gender", label: "성별", labelEn: "Gender", field: "gender", kind: "select", options: ["", ...GENDERS], width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "level", label: "구분", labelEn: "Level", field: "level", kind: "select", options: LEVELS, width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "studentType", label: "신입/재학", labelEn: "New/Continuing", field: "studentType", kind: "select", options: STUDENT_TYPES, width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "faculty", label: "학부", labelEn: "Faculty", field: "faculty", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "gradSchool", label: "대학원", labelEn: "Graduate School", field: "gradSchool", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "course", label: "과정", labelEn: "Program", field: "course", kind: "select", options: ["", "석사과정", "박사과정"], width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "major", label: "전공", labelEn: "Major", field: "major", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "grade", label: "학년", labelEn: "Grade", field: "grade", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false, align: "right" },
  { key: "semesterNo", label: "학기차", labelEn: "Semester No.", field: "semesterNo", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false, align: "right" },
  { key: "enrollStatus", label: "학적", labelEn: "Enrollment", field: "enrollStatus", kind: "select", options: ENROLL_STATUSES, width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "admissionType", label: "입학구분", labelEn: "Admission Type", field: "admissionType", kind: "select", options: ["", ...ADMISSION_TYPES], width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "admissionDate", label: "입학일자", labelEn: "Admission Date", field: "admissionDate", kind: "date", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "address", label: "주소", labelEn: "Address", field: "address", kind: "text", width: ADDRESS_WIDTH, sortable: true, defaultVisible: true },
  { key: "mobile", label: "휴대전화", labelEn: "Mobile", field: "mobile", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "phone", label: "전화번호", labelEn: "Phone", field: "phone", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "email", label: "이메일", labelEn: "Email", field: "email", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "tuition", label: "등록금", labelEn: "Tuition", field: "tuition.status", kind: "tuition", width: DOUBLE_WIDTH, sortable: true, defaultVisible: true },
  { key: "absences", label: "결석", labelEn: "Absences", field: "attendance.absences", kind: "number", width: BASE_WIDTH, sortable: true, defaultVisible: true, align: "right" },
  { key: "contactCount", label: "연락횟수", labelEn: "Contact Count", field: "contactCount", kind: "number", width: BASE_WIDTH, sortable: true, defaultVisible: true, align: "right" },
  { key: "memo", label: "메모", labelEn: "Memo", field: "memo", kind: "text", width: BASE_WIDTH, sortable: false, defaultVisible: false },
  { key: "consult", label: "상담", labelEn: "Consult", field: "", kind: "consult", width: BASE_WIDTH, sortable: false, defaultVisible: true },
];

export const DEFAULT_VISIBLE = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);

export function getPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}
