import { COLLECTIONS, coll } from "./db.mts";
import { attendanceTotals, totalsToAttendanceFields } from "../../shared/domain.ts";

/** 설정 문서에서만 학기를 읽는다 — 클라이언트가 보낸 학기를 믿으면
 * 오래된 탭이 지난 학기 문서에 쓸 수 있다. */
export async function currentTerm(): Promise<{ year: number; semester: 1 | 2 }> {
  const settings = await coll(COLLECTIONS.settings);
  const doc = await settings.findOne({ _id: "app" as any });
  return {
    year: doc?.currentYear ?? new Date().getFullYear(),
    semester: (doc?.currentSemester ?? 2) as 1 | 2,
  };
}

/** 학기가 바뀌면 이전 학기의 결석/지각 총계가 그대로 남아 필터·통계를
 * 오염시킨다. 학생 전원을 이번 학기 주차별 출결 기준으로 다시 계산한다. */
export async function recomputeAllTotals(year: number, semester: 1 | 2): Promise<number> {
  const students = await coll(COLLECTIONS.students);
  const weekly = await coll(COLLECTIONS.weeklyAttendance);

  const empty = totalsToAttendanceFields(attendanceTotals());
  await students.updateMany(
    {},
    {
      $set: {
        "attendance.absences": empty.absences,
        "attendance.late": empty.late,
        "attendance.absencesOffline": empty.absencesOffline,
        "attendance.absencesOnline": empty.absencesOnline,
        "attendance.lateOffline": empty.lateOffline,
        "attendance.lateOnline": empty.lateOnline,
        "attendance.riskAbsences": empty.riskAbsences,
      },
    }
  );

  const docs = await weekly.find({ year, semester }).toArray();
  if (docs.length === 0) return 0;

  const ops = docs.map((doc) => {
    const fields = totalsToAttendanceFields(attendanceTotals(doc.weeks as any));
    return {
      updateOne: {
        filter: { studentId: doc.studentId },
        update: {
          $set: {
            "attendance.absences": fields.absences,
            "attendance.late": fields.late,
            "attendance.absencesOffline": fields.absencesOffline,
            "attendance.absencesOnline": fields.absencesOnline,
            "attendance.lateOffline": fields.lateOffline,
            "attendance.lateOnline": fields.lateOnline,
            "attendance.riskAbsences": fields.riskAbsences,
          },
        },
      },
    };
  });
  const res = await students.bulkWrite(ops);
  return res.modifiedCount;
}
