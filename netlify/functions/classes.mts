import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { handler, json } from "../lib/http.mts";
import { CLASS_DAYS } from "../../shared/domain.ts";

/** 반 이름의 숫자를 뽑아 2반 < 10반 순으로 정렬한다. */
function classNumber(name: string): number {
  const m = /(\d+)/.exec(name);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

const koCollator = new Intl.Collator("ko", { numeric: true });

/** 반배정·출석명부에서 가져온 반 목록 + 그 반에 있는 **우리** 학생.
 * 명부에는 타 국적 학생이 더 많지만, 돌려주는 명단은 우리 학생뿐이다 —
 * 전체 인원은 rosterCount 로만 보여 준다. 우리 학생이 한 명도 없는 반(학부
 * 24개 중 14개)은 아예 돌려주지 않는다. */
export default handler(async (req) => {
  await requireRole(req, ["admin", "manager"]);
  const url = new URL(req.url);
  const classes = await coll(COLLECTIONS.classes);
  const students = await coll(COLLECTIONS.students);
  const settingsColl = await coll(COLLECTIONS.settings);

  const settings = await settingsColl.findOne({ _id: "app" as any });
  const year = Number(url.searchParams.get("year")) || settings?.currentYear || new Date().getFullYear();
  const semester = Number(url.searchParams.get("semester")) || settings?.currentSemester || 2;

  const rows = await classes.find({ year, semester }).toArray();

  // 반마다 질의하지 않고 한 번에 모아서 붙인다.
  const ids = [...new Set(rows.flatMap((r) => (r.studentIds as string[]) ?? []))];
  const found = ids.length
    ? await students
        .find(
          { studentId: { $in: ids } },
          {
            projection: {
              _id: 0,
              studentId: 1,
              nameKo: 1,
              nameEn: 1,
              level: 1,
              studentType: 1,
              enrollStatus: 1,
              mobile: 1,
            },
          }
        )
        .toArray()
    : [];
  const byId = new Map(found.map((d) => [d.studentId as string, d]));

  const out = rows
    .map((r) => {
      const mine = ((r.studentIds as string[]) ?? [])
        .map((id) => byId.get(id))
        .filter((d): d is NonNullable<typeof d> => Boolean(d))
        .sort((a, b) => koCollator.compare(String(a.nameKo ?? ""), String(b.nameKo ?? "")));
      // studentIds 는 명부 전체(타 국적 포함)라 응답에 싣지 않는다 — 대신
      // rosterCount 로 전체 인원만 알려 준다.
      return {
        _id: String(r._id),
        year: r.year as number,
        semester: r.semester as number,
        level: String(r.level ?? ""),
        name: String(r.name ?? ""),
        day: String(r.day ?? ""),
        room: String(r.room ?? ""),
        program: String(r.program ?? ""),
        track: String(r.track ?? ""),
        note: String(r.note ?? ""),
        instructors: (r.instructors as string[]) ?? [],
        rosterCount: (r.rosterCount as number) ?? 0,
        source: String(r.source ?? ""),
        sheet: String(r.sheet ?? ""),
        students: mine.map((d) => ({
          studentId: String(d.studentId ?? ""),
          nameKo: String(d.nameKo ?? ""),
          nameEn: String(d.nameEn ?? ""),
          level: String(d.level ?? ""),
          studentType: String(d.studentType ?? ""),
          enrollStatus: String(d.enrollStatus ?? ""),
          mobile: String(d.mobile ?? ""),
        })),
        ourCount: mine.length,
      };
    })
    // 우리 학생이 없는 반은 볼 일이 없다 — 드롭다운 보기까지 덜어 낸다.
    .filter((c) => c.ourCount > 0)
    .sort(
      (a, b) =>
        // 대학원 먼저, 그 다음 요일 순, 그 다음 반 번호 순.
        (a.level === b.level ? 0 : a.level === "대학원" ? -1 : 1) ||
        CLASS_DAYS.indexOf(a.day as never) - CLASS_DAYS.indexOf(b.day as never) ||
        classNumber(a.name) - classNumber(b.name) ||
        koCollator.compare(a.name, b.name)
    );

  return json({ year, semester, classes: out });
});

export const config: Config = { path: "/api/classes" };
