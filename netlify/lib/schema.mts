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
/** Capped at 7 digits to match the input UI (TuitionCell) and to keep amounts
 * well inside Number's safe integer range. */
const money = z.number().int().min(0).max(9_999_999);
/** Digits only, up to 11 — matches the input UI's phone-number cap. */
const phoneStr = z
  .string()
  .trim()
  .regex(/^\d{0,11}$/, "전화번호는 숫자 11자리 이하로 입력하세요.");

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
  phone: phoneStr.default(""),
  mobile: phoneStr.default(""),
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

export const infoItemSchema = z.object({
  id: str(60).min(1),
  label: str(120),
  value: str(1000),
});

export const infoSchema = z.object({
  tuitionDeadline: str(300).default(""),
  classTimeUndergraduate: str(300).default(""),
  classTimeGraduate: str(300).default(""),
  visaApplicationTime: str(300).default(""),
  orientation: str(300).default(""),
  items: z.array(infoItemSchema).max(50).default([]),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const studentLoginSchema = z.object({
  mobile: z.string().trim().regex(/^\d{1,11}$/, "휴대전화 번호를 정확히 입력하세요."),
  password: z.string().min(1).max(200).optional(),
});

export const telegramAuthSchema = z.object({
  initData: z.string().min(1).max(4000),
});

export const telegramLinkSchema = z.object({
  initData: z.string().min(1).max(4000),
  mobile: z.string().trim().regex(/^\d{1,11}$/, "휴대전화 번호를 정확히 입력하세요."),
  password: z.string().min(1).max(200),
});

/** Submitted by someone not yet in the system — deliberately tiny and
 * unauthenticated-safe. No free text: just the three fields needed to find
 * a matching student record for an admin to confirm. */
export const accessRequestSchema = z.object({
  nameKo: str(80).min(1, "성명을 입력하세요."),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일은 YYYY-MM-DD 형식이어야 합니다."),
  mobile: z.string().trim().regex(/^\d{1,11}$/, "휴대전화 번호를 정확히 입력하세요."),
});

export const accessRequestResolveSchema = z.discriminatedUnion("action", [
  // targetId is the matched Student's Mongo _id, not their studentId (학번).
  z.object({ action: z.literal("approve"), targetId: z.string().min(1) }),
  z.object({ action: z.literal("reject") }),
]);

/** Narrow on purpose — a student may only ever touch these fields on their own
 * record. Never reuse studentPatchSchema here: it permits enrollStatus,
 * tuition, studentId etc., which would let a student rewrite their own
 * academic record. */
export const studentProfileSchema = z
  .object({
    nameKo: str(80).min(1).optional(),
    address: str(400).optional(),
    mobile: z.string().trim().regex(/^\d{1,11}$/, "휴대전화 번호를 정확히 입력하세요.").optional(),
    currentPassword: z.string().min(1).max(200).optional(),
    newPassword: z.string().min(5).max(200).optional(),
  })
  .strict();

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
