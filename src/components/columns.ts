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
  /** Key suffix under the "students" i18n namespace's "columns" object
   * (e.g. "studentId" -> students:columns.studentId). Kept separate from
   * `domain:level.*` even for "faculty"/"gradSchool", whose Korean source
   * text ("학부"/"대학원") is shared with the LEVELS enum but means
   * something different here (a free-text department name column). */
  labelKey: string;
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
/** Tuition needs room for a status chip plus an amount, but not a full double width. */
const TUITION_WIDTH = Math.round(BASE_WIDTH * 1.6);
/** Late/absence/contact-count only ever hold a couple of digits. */
const NARROW_WIDTH = 90;

export const COLUMNS: ColumnDef[] = [
  { key: "studentId", labelKey: "studentId", field: "studentId", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: true, sticky: true },
  { key: "nameEn", labelKey: "nameEn", field: "nameEn", kind: "text", width: DOUBLE_WIDTH, sortable: true, defaultVisible: true, sticky: true },
  { key: "nameKo", labelKey: "nameKo", field: "nameKo", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "birthDate", labelKey: "birthDate", field: "birthDate", kind: "date", width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "gender", labelKey: "gender", field: "gender", kind: "select", options: ["", ...GENDERS], width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "level", labelKey: "level", field: "level", kind: "select", options: LEVELS, width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "studentType", labelKey: "studentType", field: "studentType", kind: "select", options: STUDENT_TYPES, width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "faculty", labelKey: "faculty", field: "faculty", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "gradSchool", labelKey: "gradSchool", field: "gradSchool", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "course", labelKey: "course", field: "course", kind: "select", options: ["", "석사과정", "박사과정"], width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "major", labelKey: "major", field: "major", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "grade", labelKey: "grade", field: "grade", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false, align: "right" },
  { key: "semesterNo", labelKey: "semesterNo", field: "semesterNo", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false, align: "right" },
  { key: "enrollStatus", labelKey: "enrollStatus", field: "enrollStatus", kind: "select", options: ENROLL_STATUSES, width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "admissionType", labelKey: "admissionType", field: "admissionType", kind: "select", options: ["", ...ADMISSION_TYPES], width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "admissionDate", labelKey: "admissionDate", field: "admissionDate", kind: "date", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "address", labelKey: "address", field: "address", kind: "text", width: ADDRESS_WIDTH, sortable: true, defaultVisible: true },
  { key: "mobile", labelKey: "mobile", field: "mobile", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: true },
  { key: "phone", labelKey: "phone", field: "phone", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "email", labelKey: "email", field: "email", kind: "text", width: BASE_WIDTH, sortable: true, defaultVisible: false },
  { key: "tuition", labelKey: "tuition", field: "tuition.status", kind: "tuition", width: TUITION_WIDTH, sortable: true, defaultVisible: true },
  { key: "late", labelKey: "late", field: "attendance.late", kind: "number", width: NARROW_WIDTH, sortable: true, defaultVisible: true, align: "right" },
  { key: "absences", labelKey: "absences", field: "attendance.absences", kind: "number", width: NARROW_WIDTH, sortable: true, defaultVisible: true, align: "right" },
  { key: "contactCount", labelKey: "contactCount", field: "contactCount", kind: "number", width: NARROW_WIDTH, sortable: true, defaultVisible: true, align: "right" },
  { key: "memo", labelKey: "memo", field: "memo", kind: "text", width: BASE_WIDTH, sortable: false, defaultVisible: false },
  { key: "consult", labelKey: "consult", field: "", kind: "consult", width: BASE_WIDTH, sortable: false, defaultVisible: true },
];

export const DEFAULT_VISIBLE = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);

export function getPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}
