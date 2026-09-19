import { useTranslation } from "react-i18next";
import {
  LEVEL_KEYS,
  STUDENT_TYPE_KEYS,
  GENDER_KEYS,
  ENROLL_STATUS_KEYS,
  ADMISSION_TYPE_KEYS,
  COURSE_KEYS,
  TUITION_STATUS_KEYS,
  CONSULT_CATEGORY_KEYS,
  CONSULT_METHOD_KEYS,
} from "../../shared/domainLabels";
import type { AbsenceBucketKey } from "../../shared/domain";

/** Drop-in replacement for the old useLang().tLevel/tEnrollStatus, but
 * covering every domain enum so future additions can't silently collide the
 * way "학부"/"대학원" and "삭제" used to in the flat dictionary. */
export function useDomainLabel() {
  const { t } = useTranslation("domain");
  return {
    level: (v: string) => t(LEVEL_KEYS[v] ?? v),
    studentType: (v: string) => t(STUDENT_TYPE_KEYS[v] ?? v),
    gender: (v: string) => t(GENDER_KEYS[v] ?? v),
    enrollStatus: (v: string) => t(ENROLL_STATUS_KEYS[v] ?? v),
    admissionType: (v: string) => t(ADMISSION_TYPE_KEYS[v] ?? v),
    course: (v: string) => t(COURSE_KEYS[v] ?? v),
    tuitionStatus: (v: string) => t(TUITION_STATUS_KEYS[v] ?? v),
    consultCategory: (v: string) => t(CONSULT_CATEGORY_KEYS[v] ?? v),
    consultMethod: (v: string) => t(CONSULT_METHOD_KEYS[v] ?? v),
    absenceBucket: (key: AbsenceBucketKey) => t(`absenceBucket.${key}`),
  };
}
