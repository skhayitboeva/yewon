/** Maps canonical Korean domain values (shared/domain.ts) to i18n key
 * suffixes in the "domain" namespace. The canonical values themselves must
 * never change — they are stored in and matched against MongoDB. This map
 * only decides which translation key renders each value's display label. */

export const LEVEL_KEYS: Record<string, string> = {
  학부: "level.undergraduate",
  대학원: "level.graduate",
};

export const STUDENT_TYPE_KEYS: Record<string, string> = {
  신입생: "studentType.new",
  재학생: "studentType.continuing",
};

export const GENDER_KEYS: Record<string, string> = {
  남: "gender.male",
  여: "gender.female",
};

export const ENROLL_STATUS_KEYS: Record<string, string> = {
  재학: "enrollStatus.enrolled",
  휴학: "enrollStatus.leave",
  복학: "enrollStatus.reinstated",
  제적: "enrollStatus.dismissed",
  졸업: "enrollStatus.graduated",
  자퇴: "enrollStatus.withdrawn",
  삭제: "enrollStatus.deleted",
};

export const ADMISSION_TYPE_KEYS: Record<string, string> = {
  신입학: "admissionType.new",
  편입학: "admissionType.transfer",
  재입학: "admissionType.readmission",
};

export const COURSE_KEYS: Record<string, string> = {
  "": "course.none",
  석사과정: "course.masters",
  박사과정: "course.doctoral",
};

export const TUITION_STATUS_KEYS: Record<string, string> = {
  완납: "tuitionStatus.paidInFull",
  부분납부: "tuitionStatus.partial",
  미납: "tuitionStatus.unpaid",
};

export const CONSULT_CATEGORY_KEYS: Record<string, string> = {
  등록금: "consultCategory.tuition",
  출석: "consultCategory.attendance",
  비자: "consultCategory.visa",
  "학업 관련(출석 포함)": "consultCategory.academic",
  긴급: "consultCategory.urgent",
  기타: "consultCategory.other",
};

export const CONSULT_METHOD_KEYS: Record<string, string> = {
  대면: "consultMethod.inPerson",
  전화: "consultMethod.phone",
  카카오톡: "consultMethod.kakaoTalk",
  이메일: "consultMethod.email",
  기타: "consultMethod.other",
};
