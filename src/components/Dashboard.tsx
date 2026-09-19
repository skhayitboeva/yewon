import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { StatCard } from "./StatCard";
import { CONSULT_CATEGORIES, formatKRW, type Stats } from "../../shared/domain";

/** The filter the students tab should open with when a card is clicked. */
export type DrillFilter = Record<string, string>;

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

export function Dashboard({ onDrill }: { onDrill: (filter: DrillFilter) => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["stats"], queryFn: api.stats });

  if (isLoading) return <p className="p-6 text-sm text-muted">불러오는 중…</p>;
  if (error || !data)
    return <p className="p-6 text-sm text-critical">집계를 불러오지 못했습니다.</p>;

  const s: Stats = data;
  const total = s.total || 0;
  const pct = (n: number) => (total ? n / total : 0);

  const countFor = (level: string, type: string) =>
    s.byLevelType.find((r) => r.level === level && r.studentType === type)?.count ?? 0;

  const semesterLabel = `${s.settings.currentYear}-${s.settings.currentSemester}학기`;
  const absence = s.absence;
  const tuition = s.tuitionStatus;
  const unpaidAmount = Math.max(0, (s.tuitionSums.billed || 0) - (s.tuitionSums.paid || 0));

  const consultRows = CONSULT_CATEGORIES.map((c) => {
    const hit = s.consultByCategory.find((r) => r.category === c);
    return { category: c, records: hit?.records ?? 0, students: hit?.students ?? 0 };
  });
  const consultMax = Math.max(1, ...consultRows.map((r) => r.records));

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      {/* ------------------------------------------------------------ 전체 */}
      <Section title="전체 학생" note="카드를 누르면 해당 조건으로 학생 목록이 열립니다">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="전체 학생" value={total} sub="명" onClick={() => onDrill({})} />
          <StatCard
            label="학부 · 재학생"
            value={countFor("학부", "재학생")}
            share={pct(countFor("학부", "재학생"))}
            onClick={() => onDrill({ level: "학부", studentType: "재학생" })}
          />
          <StatCard
            label={`학부 · 신입생 (${semesterLabel})`}
            value={countFor("학부", "신입생")}
            share={pct(countFor("학부", "신입생"))}
            onClick={() => onDrill({ level: "학부", studentType: "신입생" })}
          />
          <StatCard
            label="대학원 · 재학생"
            value={countFor("대학원", "재학생")}
            share={pct(countFor("대학원", "재학생"))}
            onClick={() => onDrill({ level: "대학원", studentType: "재학생" })}
          />
          <StatCard
            label={`대학원 · 신입생 (${semesterLabel})`}
            value={countFor("대학원", "신입생")}
            share={pct(countFor("대학원", "신입생"))}
            onClick={() => onDrill({ level: "대학원", studentType: "신입생" })}
          />
        </div>

        <details className="card mt-3 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink2">
            입학 코호트별 분포 (참고 — 신입/재학 지정에 사용)
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="nums w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-1.5 pr-4 font-semibold">입학 코호트</th>
                  <th className="py-1.5 pr-4 text-right font-semibold">학부</th>
                  <th className="py-1.5 pr-4 text-right font-semibold">대학원</th>
                  <th className="py-1.5 text-right font-semibold">계</th>
                </tr>
              </thead>
              <tbody>
                {[...new Set(s.cohorts.map((c) => c.cohort))].sort().map((cohort) => {
                  const u = s.cohorts.find((c) => c.cohort === cohort && c.level === "학부")?.count ?? 0;
                  const g = s.cohorts.find((c) => c.cohort === cohort && c.level === "대학원")?.count ?? 0;
                  return (
                    <tr key={cohort} className="border-b border-line last:border-0">
                      <td className="py-1.5 pr-4">
                        <button
                          className="font-semibold text-brand hover:underline"
                          onClick={() => onDrill({ cohort })}
                        >
                          {cohort}
                        </button>
                      </td>
                      <td className="py-1.5 pr-4 text-right">{u}</td>
                      <td className="py-1.5 pr-4 text-right">{g}</td>
                      <td className="py-1.5 text-right font-semibold">{u + g}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      {/* ---------------------------------------------------------- 등록금 */}
      <Section
        title="등록금"
        note={`고지 ${formatKRW(s.tuitionSums.billed)}원 · 수납 ${formatKRW(s.tuitionSums.paid)}원 · 미수 ${formatKRW(unpaidAmount)}원`}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="완납"
            value={tuition["완납"] ?? 0}
            tone="good"
            share={pct(tuition["완납"] ?? 0)}
            sub={`전체의 ${Math.round(pct(tuition["완납"] ?? 0) * 100)}%`}
            onClick={() => onDrill({ tuitionStatus: "완납" })}
          />
          <StatCard
            label="부분납부"
            value={tuition["부분납부"] ?? 0}
            tone="warning"
            share={pct(tuition["부분납부"] ?? 0)}
            sub={`전체의 ${Math.round(pct(tuition["부분납부"] ?? 0) * 100)}%`}
            onClick={() => onDrill({ tuitionStatus: "부분납부" })}
          />
          <StatCard
            label="미납"
            value={tuition["미납"] ?? 0}
            tone="critical"
            share={pct(tuition["미납"] ?? 0)}
            sub={`전체의 ${Math.round(pct(tuition["미납"] ?? 0) * 100)}%`}
            onClick={() => onDrill({ tuitionStatus: "미납" })}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([1, 2, 3, 4] as const).map((n) => {
            const value = s.terms[`term${n}` as keyof typeof s.terms] ?? 0;
            return (
              <StatCard
                key={n}
                label={`${n}차 납부`}
                value={value}
                share={pct(value)}
                sub={`전체의 ${Math.round(pct(value) * 100)}%`}
                onClick={() => onDrill({ term: String(n) })}
              />
            );
          })}
        </div>
      </Section>

      {/* ------------------------------------------------------------ 출결 */}
      <Section title="출결">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="양호 (결석 0회)"
            value={absence.good}
            tone="good"
            share={pct(absence.good)}
            onClick={() => onDrill({ absence: "good" })}
          />
          <StatCard
            label="결석 1회"
            value={absence.a1}
            tone="warning"
            share={pct(absence.a1)}
            onClick={() => onDrill({ absence: "a1" })}
          />
          <StatCard
            label="결석 2–3회"
            value={absence.a23}
            tone="serious"
            share={pct(absence.a23)}
            onClick={() => onDrill({ absence: "a23" })}
          />
          <StatCard
            label="결석 4회 이상 · F 대상"
            value={absence.a4}
            tone="critical"
            share={pct(absence.a4)}
            sub="즉시 상담 필요"
            onClick={() => onDrill({ absence: "a4" })}
          />
        </div>
      </Section>

      {/* ------------------------------------------------------------ 상담 */}
      <Section title="상담" note="분야별 기록 건수 (한 기록이 여러 분야에 해당할 수 있음)">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="card p-4 lg:col-span-2">
            <ul className="space-y-2.5">
              {consultRows.map((row) => (
                <li key={row.category} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-sm font-semibold text-ink2">
                    {row.category}
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#edf1f5]">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${(row.records / consultMax) * 100}%` }}
                    />
                  </span>
                  <span className="nums w-28 shrink-0 text-right text-sm">
                    <b>{row.records}</b>건
                    <span className="ml-1 text-xs text-muted">· {row.students}명</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold">최근 상담</h3>
            {s.recentConsults.length === 0 ? (
              <p className="mt-3 text-sm text-muted">기록이 없습니다.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {s.recentConsults.map((r) => (
                  <li key={r._id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="nums flex items-center gap-2 text-xs text-muted">
                      <span>{r.date}</span>
                      <span>·</span>
                      <span className="font-semibold text-ink2">
                        {r.nameKo || r.studentId}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.categories.map((c) => (
                        <span key={c} className="chip bg-[#eef3fa] text-brand">
                          {c}
                        </span>
                      ))}
                    </div>
                    {r.content && (
                      <p className="mt-1 line-clamp-2 text-sm text-ink2">{r.content}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
