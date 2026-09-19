import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { StatCard } from "./StatCard";
import { CONSULT_CATEGORIES, formatKRW, type Stats } from "../../shared/domain";
import { useLang } from "../i18n";

/** The filter the students tab should open with when a card is clicked. */
export type DrillFilter = Record<string, string>;

type ListTone = "brand" | "good" | "warning" | "serious" | "critical";

const TONE_DOT: Record<ListTone, string> = {
  brand: "bg-brand",
  good: "bg-good",
  warning: "bg-warning",
  serious: "bg-serious",
  critical: "bg-critical",
};

type StatusRowData = { key: string; label: string; value: number; tone: ListTone; onClick: () => void };

/** One row of a status breakdown list — a labeled bar, sized relative to `max` / `total`. */
function StatusRow({ row, max, total }: { row: StatusRowData; max: number; total: number }) {
  const { lang } = useLang();
  const percentage = total ? Math.round((row.value / total) * 100) : 0;
  return (
    <li>
      <button
        type="button"
        onClick={row.onClick}
        className="flex w-full items-center gap-3 rounded-lg text-left transition hover:bg-plane"
      >
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[row.tone]}`} />
        <span className="w-32 shrink-0 text-sm font-semibold text-ink2">{row.label}</span>
        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#edf1f5]">
          <span
            className={`block h-full rounded-full ${TONE_DOT[row.tone]}`}
            style={{ width: `${(row.value / max) * 100}%` }}
          />
        </span>
        <span className="nums w-24 shrink-0 text-right text-sm">
          <b>{row.value}</b>
          {lang === "en" ? "" : "명"}
          <span className="ml-1 text-xs text-muted">· {percentage}%</span>
        </span>
      </button>
    </li>
  );
}

/** One box holding a labeled breakdown — used for attendance. */
function StatusListCard({
  title,
  note,
  rows,
}: {
  title: string;
  note?: string;
  rows: StatusRowData[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
      <ul className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <StatusRow key={row.key} row={row} max={max} total={total} />
        ))}
      </ul>
    </div>
  );
}

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
  const { lang, t, tLevel } = useLang();

  if (isLoading) return <p className="p-6 text-sm text-muted">{t("불러오는 중…")}</p>;
  if (error || !data)
    return <p className="p-6 text-sm text-critical">{t("집계를 불러오지 못했습니다.")}</p>;

  const s: Stats = data;
  const total = s.total || 0;
  const pct = (n: number) => (total ? n / total : 0);

  const countFor = (level: string, type: string) =>
    s.byLevelType.find((r) => r.level === level && r.studentType === type)?.count ?? 0;

  const semesterLabel =
    lang === "en"
      ? `${s.settings.currentYear}-${s.settings.currentSemester} semester`
      : `${s.settings.currentYear}-${s.settings.currentSemester}학기`;
  const absence = s.absence;
  const tuition = s.tuitionStatus;
  const unpaidAmount = Math.max(0, (s.tuitionSums.billed || 0) - (s.tuitionSums.paid || 0));
  const won = (n: number) => (lang === "en" ? `${formatKRW(n)} won` : `${formatKRW(n)}원`);
  const ofTotal = (share: number) =>
    lang === "en" ? `${Math.round(share * 100)}% ${t("전체의")}` : `${t("전체의")} ${Math.round(share * 100)}%`;

  const consultRows = CONSULT_CATEGORIES.map((c) => {
    const hit = s.consultByCategory.find((r) => r.category === c);
    return { category: c, records: hit?.records ?? 0, students: hit?.students ?? 0 };
  });
  const consultMax = Math.max(1, ...consultRows.map((r) => r.records));

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      {/* ------------------------------------------------------------ 전체 */}
      <Section title={t("전체 학생")} note={t("카드를 누르면 해당 조건으로 학생 목록이 열립니다")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label={t("전체 학생")} value={total} sub={t("명")} onClick={() => onDrill({})} />
          <StatCard
            label={`${tLevel("학부")} · ${t("재학생")}`}
            value={countFor("학부", "재학생")}
            share={pct(countFor("학부", "재학생"))}
            onClick={() => onDrill({ level: "학부", studentType: "재학생" })}
          />
          <StatCard
            label={`${tLevel("학부")} · ${t("신입생")} (${semesterLabel})`}
            value={countFor("학부", "신입생")}
            share={pct(countFor("학부", "신입생"))}
            onClick={() => onDrill({ level: "학부", studentType: "신입생" })}
          />
          <StatCard
            label={`${tLevel("대학원")} · ${t("재학생")}`}
            value={countFor("대학원", "재학생")}
            share={pct(countFor("대학원", "재학생"))}
            onClick={() => onDrill({ level: "대학원", studentType: "재학생" })}
          />
          <StatCard
            label={`${tLevel("대학원")} · ${t("신입생")} (${semesterLabel})`}
            value={countFor("대학원", "신입생")}
            share={pct(countFor("대학원", "신입생"))}
            onClick={() => onDrill({ level: "대학원", studentType: "신입생" })}
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------- 등록금 */}
      <Section
        title={t("등록금")}
        note={`${t("고지")} ${won(s.tuitionSums.billed)} · ${t("수납")} ${won(s.tuitionSums.paid)} · ${t("미수")} ${won(unpaidAmount)}`}
      >
        {(() => {
          const statusRows: StatusRowData[] = [
            {
              key: "완납",
              label: t("완납"),
              value: tuition["완납"] ?? 0,
              tone: "good",
              onClick: () => onDrill({ tuitionStatus: "완납" }),
            },
            {
              key: "부분납부",
              label: t("부분납부"),
              value: tuition["부분납부"] ?? 0,
              tone: "warning",
              onClick: () => onDrill({ tuitionStatus: "부분납부" }),
            },
            {
              key: "미납",
              label: t("미납"),
              value: tuition["미납"] ?? 0,
              tone: "critical",
              onClick: () => onDrill({ tuitionStatus: "미납" }),
            },
          ];
          const max = Math.max(1, ...statusRows.map((r) => r.value));
          const total = statusRows.reduce((sum, r) => sum + r.value, 0);

          // Term counts are scoped to 부분납부 students only (see stats.mts),
          // so their share/percentage should be relative to that group, not
          // every student.
          const partialCount = tuition["부분납부"] ?? 0;
          const pctOfPartial = (n: number) => (partialCount ? n / partialCount : 0);

          return (
            <div className="card p-4">
              <h3 className="text-sm font-bold">{t("납부 현황")}</h3>
              <ul className="mt-3 space-y-2.5">
                <StatusRow row={statusRows[0]} max={max} total={total} />
                <StatusRow row={statusRows[1]} max={max} total={total} />
              </ul>

              {/* pl-40 (160px) lines the cards up with where the row bars above start:
                  dot (8px) + gap-3 (12px) + label w-32 (128px) + gap-3 (12px). */}
              <p className="pl-0 text-[11px] text-muted sm:pl-40">
                {lang === "en" ? "Among partially-paid students" : "부분납부 학생 기준"}
              </p>
              <div className="mt-1.5 mb-3 grid grid-cols-2 gap-2 pl-0 sm:pl-40 lg:grid-cols-4">
                {([1, 2, 3, 4] as const).map((n) => {
                  const value = s.terms[`term${n}` as keyof typeof s.terms] ?? 0;
                  return (
                    <StatCard
                      key={n}
                      compact
                      label={lang === "en" ? `Term ${n} payment` : `${n}차 납부`}
                      value={value}
                      share={pctOfPartial(value)}
                      sub={ofTotal(pctOfPartial(value))}
                      onClick={() => onDrill({ term: String(n), tuitionStatus: "부분납부" })}
                    />
                  );
                })}
              </div>

              <ul className="space-y-2.5">
                <StatusRow row={statusRows[2]} max={max} total={total} />
              </ul>
            </div>
          );
        })()}
      </Section>

      {/* ------------------------------------------------------------ 출결 */}
      <Section title={t("출결")}>
        <StatusListCard
          title={t("출결 현황")}
          note={absence.a4 > 0 ? t("결석 4회 이상은 즉시 상담 필요") : undefined}
          rows={[
            {
              key: "good",
              label: t("양호 (0회)"),
              value: absence.good,
              tone: "good",
              onClick: () => onDrill({ absence: "good" }),
            },
            {
              key: "a1",
              label: t("결석 1회"),
              value: absence.a1,
              tone: "warning",
              onClick: () => onDrill({ absence: "a1" }),
            },
            {
              key: "a23",
              label: t("결석 2–3회"),
              value: absence.a23,
              tone: "serious",
              onClick: () => onDrill({ absence: "a23" }),
            },
            {
              key: "a4",
              label: t("결석 4회 이상"),
              value: absence.a4,
              tone: "critical",
              onClick: () => onDrill({ absence: "a4" }),
            },
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------ 상담 */}
      <Section
        title={lang === "en" ? "Consultations" : "상담"}
        note={t("분야별 기록 건수 (한 기록이 여러 분야에 해당할 수 있음)")}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="card p-4 lg:col-span-2">
            <ul className="space-y-2.5">
              {consultRows.map((row) => (
                <li key={row.category} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-sm font-semibold text-ink2">
                    {t(row.category)}
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#edf1f5]">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${(row.records / consultMax) * 100}%` }}
                    />
                  </span>
                  <span className="nums w-28 shrink-0 text-right text-sm">
                    <b>{row.records}</b>
                    {lang === "en" ? "" : "건"}
                    <span className="ml-1 text-xs text-muted">
                      · {row.students}
                      {lang === "en" ? "" : "명"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold">{lang === "en" ? "Recent Consultations" : "최근 상담"}</h3>
            {s.recentConsults.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t("기록이 없습니다.")}</p>
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
                          {t(c)}
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
