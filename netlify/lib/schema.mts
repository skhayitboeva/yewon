import { z } from "zod";
import { HttpError } from "./http.mts";
import {
  ADMISSION_TYPES,
  CONSULT_CATEGORIES,
  CONSULT_METHODS,
  ENROLL_STATUSES,
  GENDERS,
  LEVELS,
  STUDENT_TYPES,
  TUITION_STATUSES,
} from "../../shared/domain.ts";

const str = (max = 300) => z.string().trim().max(max);
const dateStr = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "날짜는 YYYY-MM-DD 형식이어야 합니다.");
const money = z.number().int().min(0).max(1_000_000_000);

export const tuitionSchema = z.object({
  status: z.enum(TUITION_STATUSES),
  total: money,
  term1: money,
  term2: money,
  term3: money,
  term4: money,
  note: str(500),
});

export const attendanceSchema = z.object({
  absences: z.number().int().min(0).max(999),
  note: str(500),
});

export const studentCreateSchema = z.object({
  studentId: str(40).min(1, "학번은 필수입니다."),
  level: z.enum(LEVELS),
  studentType: z.enum(STUDENT_TYPES).default("재학생"),
  nameKo: str(80).min(1, "성명은 필수입니다."),
  nameEn: str(160).default(""),
  birthDate: dateStr.default(""),
  gender: z.enum(GENDERS).or(z.literal("")).default(""),
  grade: str(10).default(""),
  semesterNo: str(10).default(""),
  enrollStatus: z.enum(ENROLL_STATUSES).default("재학"),
  major: str(120).default(""),
  faculty: str(120).default(""),
  gradSchool: str(120).default(""),
  course: str(40).default(""),
  admissionDate: dateStr.default(""),
  admissionType: z.enum(ADMISSION_TYPES).or(z.literal("")).default("신입학"),
  nationality: str(60).default("우즈베키스탄"),
  address: str(400).default(""),
  phone: str(40).default(""),
  mobile: str(40).default(""),
  email: str(160).default(""),
  lastRegYear: str(10).default(""),
  lastRegSemester: str(10).default(""),
  tuition: tuitionSchema.partial().optional(),
  attendance: attendanceSchema.partial().optional(),
  contactCount: z.number().int().min(0).max(9999).default(0),
  memo: str(2000).default(""),
});

/** PATCH accepts any subset; nested objects may also be partial. */
export const studentPatchSchema = studentCreateSchema
  .partial()
  .extend({
    tuition: tuitionSchema.partial().optional(),
    attendance: attendanceSchema.partial().optional(),
  })
  .strict();

export const bulkPatchSchema = z.object({
  ids: z.array(z.string().min(1)).max(5000).optional(),
  /** When `all` is true the current filter query decides the target set. */
  all: z.boolean().optional(),
  filter: z.record(z.string()).optional(),
  set: z
    .object({
      studentType: z.enum(STUDENT_TYPES).optional(),
      enrollStatus: z.enum(ENROLL_STATUSES).optional(),
      "tuition.status": z.enum(TUITION_STATUSES).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "변경할 항목이 없습니다."),
});

export const consultationCreateSchema = z.object({
  studentId: str(40).min(1),
  date: dateStr.refine((v) => v.length === 10, "일자는 필수입니다."),
  categories: z.array(z.enum(CONSULT_CATEGORIES)).min(1, "분야를 하나 이상 선택하세요."),
  method: z.enum(CONSULT_METHODS).or(z.literal("")).default(""),
  content: str(4000).default(""),
  result: str(4000).default(""),
  counselor: str(80).default(""),
});

export const consultationPatchSchema = consultationCreateSchema.partial().strict();

export const settingsSchema = z.object({
  currentYear: z.number().int().min(2000).max(2100),
  currentSemester: z.union([z.literal(1), z.literal(2)]),
});

export const loginSchema = z.object({ password: z.string().min(1).max(200) });

/** Turns `{tuition: {term1: 1}}` into `{"tuition.term1": 1}` so $set is surgical. */
export function flattenSet(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenSet(value as Record<string, unknown>, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first.path.join(".");
    throw new HttpError(400, where ? `${where}: ${first.message}` : first.message);
  }
  return result.data;
}
