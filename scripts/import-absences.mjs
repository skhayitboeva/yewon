#!/usr/bin/env node
/**
 * 이 스크립트는 폐기되었습니다.
 *
 * 결석 "총계"를 students.attendance.absences 에 직접 쓰는 방식이었는데, 이제
 * 그 값은 weekly_attendance(주차별 출결)에서 자동으로 계산되는 파생값입니다.
 * 이 스크립트를 계속 쓰면 다음에 누가 출결 그리드에서 칸 하나만 눌러도 방금
 * 쓴 총계가 사라집니다.
 *
 * 대신 scripts/import-weekly-attendance.mjs 를 쓰세요:
 *
 *   node scripts/import-weekly-attendance.mjs "9주차.csv" --mode offline --week 9
 *   node scripts/import-weekly-attendance.mjs "10월 온라인.csv" --mode online
 */
console.error(
  "scripts/import-absences.mjs 는 더 이상 쓰지 않습니다. " +
    "scripts/import-weekly-attendance.mjs --mode offline|online 을 사용하세요."
);
process.exit(1);
