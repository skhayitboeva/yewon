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

export const COLUMNS: ColumnDef[] = [
  { key: "studentId", label: "학번", field: "studentId", kind: "text", width: 110, sortable: true, defaultVisible: true, sticky: true },
  { key: "nameKo", label: "성명", field: "nameKo", kind: "text", width: 120, sortable: true, defaultVisible: true, sticky: true },
  { key: "nameEn", label: "성명(영문)", field: "nameEn", kind: "text", width: 240, sortable: true, defaultVisible: true },
  { key: "birthDate", label: "생년월일", field: "birthDate", kind: "date", width: 130, sortable: true, defaultVisible: true },
  { key: "gender", label: "성별", field: "gender", kind: "select", options: ["", ...GENDERS], width: 70, sortable: true, defaultVisible: false },
  { key: "level", label: "구분", field: "level", kind: "select", options: LEVELS, width: 92, sortable: true, defaultVisible: true },
  { key: "studentType", label: "신입/재학", field: "studentType", kind: "select", options: STUDENT_TYPES, width: 104, sortable: true, defaultVisible: true },
  { key: "faculty", label: "학부", field: "faculty", kind: "text", width: 170, sortable: true, defaultVisible: false },
  { key: "gradSchool", label: "대학원", field: "gradSchool", kind: "text", width: 150, sortable: true, defaultVisible: false },
  { key: "course", label: "과정", field: "course", kind: "select", options: ["", "석사과정", "박사과정"], width: 100, sortable: true, defaultVisible: false },
  { key: "major", label: "전공", field: "major", kind: "text", width: 170, sortable: true, defaultVisible: true },
  { key: "grade", label: "학년", field: "grade", kind: "text", width: 64, sortable: true, defaultVisible: false, align: "right" },
  { key: "semesterNo", label: "학기차", field: "semesterNo", kind: "text", width: 72, sortable: true, defaultVisible: false, align: "right" },
  { key: "enrollStatus", label: "학적", field: "enrollStatus", kind: "select", options: ENROLL_STATUSES, width: 92, sortable: true, defaultVisible: true },
  { key: "admissionType", label: "입학구분", field: "admissionType", kind: "select", options: ["", ...ADMISSION_TYPES], width: 96, sortable: true, defaultVisible: false },
  { key: "admissionDate", label: "입학일자", field: "admissionDate", kind: "date", width: 130, sortable: true, defaultVisible: false },
  { key: "address", label: "주소", field: "address", kind: "text", width: 300, sortable: true, defaultVisible: true },
  { key: "mobile", label: "휴대전화", field: "mobile", kind: "text", width: 130, sortable: true, defaultVisible: true },
  { key: "phone", label: "전화번호", field: "phone", kind: "text", width: 130, sortable: true, defaultVisible: false },
  { key: "email", label: "이메일", field: "email", kind: "text", width: 200, sortable: true, defaultVisible: false },
  { key: "tuition", label: "등록금", field: "tuition.status", kind: "tuition", width: 200, sortable: true, defaultVisible: true },
  { key: "absences", label: "결석", field: "attendance.absences", kind: "number", width: 72, sortable: true, defaultVisible: true, align: "right" },
  { key: "contactCount", label: "연락횟수", field: "contactCount", kind: "number", width: 84, sortable: true, defaultVisible: true, align: "right" },
  { key: "memo", label: "메모", field: "memo", kind: "text", width: 220, sortable: false, defaultVisible: false },
  { key: "consult", label: "상담", field: "", kind: "consult", width: 96, sortable: false, defaultVisible: true },
];

export const DEFAULT_VISIBLE = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);

export function getPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}
