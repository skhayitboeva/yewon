import { useSyncExternalStore } from "react";

export type Lang = "ko" | "en";

const STORAGE_KEY = "yewon_lang";

function readStored(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ko";
  } catch {
    return "ko";
  }
}

let lang: Lang = readStored();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  notify();
}

export function toggleLang() {
  setLang(lang === "ko" ? "en" : "ko");
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * ko source text -> en translation. Keyed by the exact Korean string used at
 * each call site, so most components just wrap literals in `t("...")`
 * instead of introducing separate translation keys.
 */
const EN: Record<string, string> = {
  // ---- generic / shared -------------------------------------------------
  "확인 중…": "Checking…",
  "불러오는 중…": "Loading…",
  "저장 중…": "Saving…",
  취소: "Cancel",
  저장: "Save",
  삭제: "Delete",
  수정: "Edit",
  추가: "Add",
  닫기: "Close",
  전체: "All",
  기본값: "Default",
  검색: "Search",
  이전: "Previous",
  다음: "Next",
  "선택 해제": "Clear selection",
  "필터 해제": "Clear filters",
  "클릭하여 수정": "Click to edit",

  // ---- header / nav -------------------------------------------------
  "예원예술대학교 유학생 관리 시스템": "Yewon University International Student Management System",
  "학부 · 대학원 | 학적 · 등록금 · 출결 · 상담 통합 관리":
    "Undergraduate · Graduate | Enrollment, tuition, attendance & consultation management",
  로그아웃: "Logout",
  대시보드: "Dashboard",
  "전체 학생": "All Students",
  안내: "Info",

  // ---- login -------------------------------------------------
  "로그인에 실패했습니다.": "Login failed.",
  예원예술대학교: "Yewon University",
  "유학생 관리 시스템": "International Student Management System",
  아이디: "Username",
  비밀번호: "Password",
  로그인: "Log in",
  "아이디 또는 비밀번호가 올바르지 않습니다.": "Incorrect username or password.",
  "권한이 없습니다.": "You do not have permission to do this.",
  "학생 개인정보가 포함된 시스템입니다. 비밀번호를 외부에 공유하지 마세요.":
    "This system contains students' personal data. Do not share the password externally.",
  "학생이신가요? 휴대전화 번호로 로그인": "Are you a student? Log in with your phone number",
  "직원이신가요? 아이디로 로그인": "Are you staff? Log in with your username",
  "휴대전화 번호": "Mobile phone number",
  확인: "Continue",
  "비밀번호 만들기": "Create a password",
  "가입 완료": "Finish sign-up",
  뒤로: "Back",
  "비밀번호는 5자 이상이어야 합니다.": "Password must be at least 5 characters.",
  "등록된 학생 정보를 찾을 수 없습니다.": "No matching student record was found.",
  "비밀번호 초기화": "Reset password",
  "비밀번호를 초기화했습니다.": "Password reset.",
  "초기화에 실패했습니다.": "Reset failed.",

  // ---- dashboard -------------------------------------------------
  "카드를 누르면 해당 조건으로 학생 목록이 열립니다": "Click a card to open the filtered student list",
  명: "students",
  등록금: "Tuition",
  완납: "Paid in full",
  부분납부: "Partially paid",
  미납: "Unpaid",
  "납부 현황": "Payment Status",
  "차수별 납부": "Payment by Term",
  출결: "Attendance",
  "결석 4회 이상은 즉시 상담 필요": "4+ absences need immediate consultation",
  "출결 현황": "Attendance Status",
  "양호 (0회)": "Good (0)",
  "결석 1회": "1 absence",
  "결석 2–3회": "2–3 absences",
  "결석 4회 이상": "4+ absences",
  "결석 4회 이상 (F 대상)": "4+ absences (F risk)",
  상담: "Consult",
  "분야별 기록 건수 (한 기록이 여러 분야에 해당할 수 있음)":
    "Record count by category (one record may span multiple categories)",
  건: "records",
  "기록이 없습니다.": "No records.",
  고지: "Billed",
  수납: "Collected",
  미수: "Outstanding",
  전체의: "of total",

  // ---- filters -------------------------------------------------
  "학번 · 성명 · 영문명 · 연락처": "Student ID · Name · English name · Contact",
  구분: "Level",
  "구분 전체": "All levels",
  "신입/재학": "New/Continuing",
  "신입/재학 전체": "All (new/continuing)",
  전공: "Major",
  "전공 전체": "All majors",
  학적: "Enrollment",
  "학적 전체": "All enrollment statuses",
  "등록금 전체": "All tuition statuses",
  "납부 차수": "Payment term",
  "납부 차수 전체": "All terms",
  "출결 전체": "All attendance",
  "입학 코호트": "Admission cohort",
  "입학 코호트 전체": "All cohorts",
  "CSV 내보내기": "Export CSV",

  // ---- field / column labels -------------------------------------------------
  학번: "Student ID",
  성명: "Name",
  "성명(영문)": "Name (English)",
  생년월일: "Date of Birth",
  성별: "Gender",
  학년: "Grade",
  학기차: "Semester No.",
  입학구분: "Admission Type",
  입학일자: "Admission Date",
  주소: "Address",
  휴대전화: "Mobile",
  전화번호: "Phone",
  이메일: "Email",
  연락횟수: "Contact Count",
  메모: "Memo",
  국적: "Nationality",
  과정: "Program",
  비고: "Note",
  일자: "Date",
  담당자: "Counselor",

  // ---- domain enums -------------------------------------------------
  신입생: "New student",
  재학생: "Continuing student",
  남: "Male",
  여: "Female",
  재학: "Enrolled",
  휴학: "Leave of absence",
  복학: "Reinstated",
  제적: "Dismissed",
  졸업: "Graduated",
  자퇴: "Withdrawn",
  신입학: "New admission",
  편입학: "Transfer admission",
  재입학: "Readmission",
  석사과정: "Master's course",
  박사과정: "Doctoral course",
  출석: "Attendance",
  비자: "Visa",
  "학업 관련(출석 포함)": "Academic (incl. attendance)",
  긴급: "Urgent",
  기타: "Other",
  대면: "In person",
  전화: "Phone",
  카카오톡: "KakaoTalk",

  // ---- server error messages (surfaced verbatim via ApiError.message) ----
  "잘못된 ID 입니다.": "Invalid ID.",
  "변경할 항목이 없습니다.": "No changes to apply.",
  "상담 기록을 찾을 수 없습니다.": "Consultation record not found.",
  "지원하지 않는 메서드입니다.": "Method not supported.",
  "POST만 허용됩니다.": "Only POST is allowed.",
  "PATCH만 허용됩니다.": "Only PATCH is allowed.",
  "APP_PASSWORD_HASH 환경변수가 설정되지 않았습니다.": "APP_PASSWORD_HASH is not configured.",
  "로그인 시도가 너무 많습니다. 15분 후에 다시 시도하세요.":
    "Too many login attempts. Try again in 15 minutes.",
  "비밀번호가 올바르지 않습니다.": "Incorrect password.",
  "학생을 찾을 수 없습니다.": "Student not found.",
  "선택된 학생이 없습니다.": "No students selected.",
  "로그인이 필요합니다.": "Login required.",
  "서버 오류가 발생했습니다.": "A server error occurred.",
  "요청 본문이 올바른 JSON이 아닙니다.": "Request body is not valid JSON.",
  "날짜는 YYYY-MM-DD 형식이어야 합니다.": "Date must be in YYYY-MM-DD format.",
  "학번은 필수입니다.": "Student ID is required.",
  "성명은 필수입니다.": "Name is required.",
  "일자는 필수입니다.": "Date is required.",
  "분야를 하나 이상 선택하세요.": "Select at least one category.",
  "분할 납부 합계가 총액을 초과할 수 없습니다.": "Term payments cannot exceed the total.",
  "전화번호는 숫자 11자리 이하로 입력하세요.": "Phone number must be 11 digits or fewer.",

  // ---- form validation / toasts -------------------------------------------------
  "학번을 입력하세요.": "Enter a student ID.",
  "성명을 입력하세요.": "Enter a name.",
  "저장에 실패했습니다.": "Failed to save.",
  "일괄 변경에 실패했습니다.": "Bulk update failed.",
  "삭제에 실패했습니다.": "Failed to delete.",
  "학생을 삭제했습니다.": "Student deleted.",
  "학생을 추가했습니다.": "Student added.",
  "목록을 불러오지 못했습니다.": "Failed to load the list.",
  "조건에 맞는 학생이 없습니다.": "No students match the current filters.",
  "집계를 불러오지 못했습니다.": "Failed to load the dashboard stats.",
  "상담 기록을 수정했습니다.": "Consultation record updated.",
  "상담 기록을 추가했습니다.": "Consultation record added.",
  "상담 기록을 삭제했습니다.": "Consultation record deleted.",
  "이 상담 기록을 삭제할까요?": "Delete this consultation record?",

  // ---- add-student modal -------------------------------------------------
  "학생 추가": "Add Student",
  "학번과 성명은 필수입니다. 나머지는 나중에 표에서 채울 수 있습니다.":
    "Student ID and name are required. Everything else can be filled in later from the table.",

  // ---- consult modal -------------------------------------------------
  "상담 기록 수정": "Edit Consultation Record",
  "새 상담 기록": "New Consultation Record",
  "상담 방법": "Method",
  "상담 분야 (복수 선택)": "Categories (select all that apply)",
  "상담 내용": "Details",
  "조치 / 결과": "Action / Outcome",
  "수정 취소": "Cancel edit",
  "수정 저장": "Save changes",
  "기록 추가": "Add record",
  "일자와 상담 분야를 선택해야 저장할 수 있습니다.": "Choose a date and at least one category to save.",
  "아직 상담 기록이 없습니다.": "No consultation records yet.",
  "전공 미입력": "Major not entered",

  // ---- tuition cell -------------------------------------------------
  상태: "Status",
  "총액 (원)": "Total (KRW)",

  // ---- info tab -------------------------------------------------
  "이 정보는 관리자만 입력·수정할 수 있으며, 그 외 사용자는 조회만 가능합니다.":
    "This information can only be entered or edited by an administrator. Other users can view it only.",
  "등록금 마감 기한": "Tuition Fee Deadline",
  "학부 수업 요일 및 시간": "Undergraduate Class Day & Time",
  "대학원 수업 요일 및 시간": "Graduate Class Day & Time",
  "비자 신청 시간": "Visa Application Time",
  오리엔테이션: "Orientation",
  미입력: "Not set",
  "안내 정보를 저장했습니다.": "Info saved.",
  제목: "Title",
  "새 항목 추가": "Add item",
};

export function translate(ko: string): string {
  if (lang !== "en") return ko;
  return EN[ko] ?? ko;
}

/**
 * LEVELS domain values only ("학부"/"대학원" meaning Undergraduate/Graduate).
 * Kept separate from the general dictionary because the same two words are
 * reused as column/field labels for unrelated fields (faculty & grad-school
 * department names), which need different English translations.
 */
export function translateLevel(v: string): string {
  if (lang !== "en") return v;
  if (v === "학부") return "Undergraduate";
  if (v === "대학원") return "Graduate";
  return v;
}

/**
 * ENROLL_STATUSES values only. "삭제" needs "Deleted" (a status) here, not
 * "Delete" (the button verb) that the general dictionary maps it to.
 */
export function translateEnrollStatus(v: string): string {
  if (lang !== "en") return v;
  if (v === "삭제") return "Deleted";
  return translate(v);
}

export function useLang() {
  const current = useSyncExternalStore(subscribe, getLang, getLang);
  return {
    lang: current,
    t: translate,
    tLevel: translateLevel,
    tEnrollStatus: translateEnrollStatus,
    toggle: toggleLang,
  };
}
