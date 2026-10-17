import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { useDomainLabel } from "../i18n/domainLabels";
import { CLASS_DAYS, isEnrolled, type ClassGroupWithStudents } from "../../shared/domain";
import { Select } from "./Filters";
import type { DrillFilter } from "./Dashboard";

type TimetableFilters = {
  level: string;
  day: string;
  name: string;
  room: string;
  instructor: string;
  q: string;
};

const EMPTY: TimetableFilters = {
  level: "",
  day: "",
  name: "",
  room: "",
  instructor: "",
  q: "",
};

/** 반 하나가 지금 필터에 걸리는지, 그리고 그 반에서 보여 줄 학생은 누구인지.
 * 검색어는 반 자체가 아니라 학생을 찾는 말이라 — 맞는 학생이 있는 반만 남기고,
 * 그 반 안에서도 맞는 학생만 보여 준다. "이 학생 무슨 반이야?" 가 한 번에 된다. */
function applyFilters(
  group: ClassGroupWithStudents,
  f: TimetableFilters
): ClassGroupWithStudents | null {
  if (f.level && group.level !== f.level) return null;
  if (f.day && (f.day === "none" ? group.day !== "" : group.day !== f.day)) return null;
  if (f.name && group.name !== f.name) return null;
  if (f.room && group.room !== f.room) return null;
  if (f.instructor && !group.instructors.includes(f.instructor)) return null;

  const q = f.q.trim().toLowerCase();
  const students = q
    ? group.students.filter((s) =>
        [s.studentId, s.nameKo, s.nameEn].some((v) => v?.toLowerCase().includes(q))
      )
    : group.students;

  if (q && students.length === 0) return null;
  return { ...group, students, ourCount: students.length };
}

/** 반 하나 — 첫 줄이 요일 + 강의실이고, 그 아래가 우리 학생 명단이다.
 * 명부에는 타 국적 학생이 더 많지만 여기 나오는 명단은 우리 학생뿐이다. */
function ClassCard({
  group,
  onDrill,
}: {
  group: ClassGroupWithStudents;
  onDrill: (filter: DrillFilter) => void;
}) {
  const { t } = useTranslation(["timetable", "common"]);
  const domain = useDomainLabel();
  const [open, setOpen] = useState(true);
  const dayLabel = group.day ? t(`timetable:days.${group.day}`) : "";

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-semibold text-ink2">
        {dayLabel && <span className="chip bg-[#eef3fa] text-brand">{dayLabel}</span>}
        <span>{group.room || t("timetable:noRoom")}</span>
        {group.program && <span className="text-muted">· {group.program}</span>}
        {group.track && <span className="chip bg-plane text-ink2">{group.track}</span>}
        {group.note && <span className="chip bg-plane text-ink2">{group.note}</span>}
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold">{group.name}</h3>
        <span className="nums text-xs text-muted">
          {t("timetable:counts", { ours: group.ourCount, total: group.rosterCount })}
        </span>
      </div>

      {group.instructors.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          {t("timetable:instructors")}: {group.instructors.join(", ")}
        </p>
      )}

      {group.ourCount === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("timetable:noneOfOurs")}</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 text-xs font-semibold text-brand hover:underline"
          >
            {open ? t("timetable:hideRoster") : t("timetable:showRoster")}
          </button>
          {open && (
            <ol className="mt-2 divide-y divide-line border-t border-line">
              {group.students.map((s, i) => (
                <li key={s.studentId}>
                  <button
                    type="button"
                    onClick={() => onDrill({ q: s.studentId })}
                    className="flex w-full items-center gap-2 py-1.5 text-left transition hover:bg-plane"
                    title={t("timetable:openInStudents")}
                  >
                    <span className="nums w-6 shrink-0 text-xs text-muted">{i + 1}</span>
                    <span className="nums w-24 shrink-0 text-xs font-semibold text-ink2">
                      {s.studentId}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.nameKo}</span>
                    <span className="hidden min-w-0 flex-1 truncate text-xs text-muted sm:block">
                      {s.nameEn}
                    </span>
                    {/* 명부에는 남아 있지만 우리 쪽에서는 재학이 아닌 학생 —
                        아무 표시가 없으면 재학생으로 오해하기 쉽다. */}
                    {!isEnrolled(s.enrollStatus) && (
                      <span className="chip shrink-0 bg-[#fdeeee] text-critical">
                        {domain.enrollStatus(s.enrollStatus)}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted">
                      {domain.studentType(s.studentType)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

/** 보고 싶은 것만 고르는 줄 — 학생 표의 필터와 같은 모양(Filters.tsx 의 Select). */
function TimetableFilterBar({
  filters,
  onChange,
  onReset,
  rows,
  classCount,
  studentCount,
}: {
  filters: TimetableFilters;
  onChange: (patch: Partial<TimetableFilters>) => void;
  onReset: () => void;
  rows: ClassGroupWithStudents[];
  classCount: number;
  studentCount: number;
}) {
  const { t } = useTranslation(["timetable", "common"]);
  const domain = useDomainLabel();

  // 드롭다운 보기는 실제로 들어온 자료에서만 뽑는다 — 없는 강의실/교수를 고르고
  // 빈 화면을 보는 일이 없도록.
  const options = useMemo(() => {
    const uniq = (vals: string[]) => [...new Set(vals.filter(Boolean))];
    return {
      levels: uniq(rows.map((r) => r.level)),
      days: CLASS_DAYS.filter((d) => rows.some((r) => r.day === d)),
      hasDayless: rows.some((r) => !r.day),
      names: uniq(rows.map((r) => r.name)),
      rooms: uniq(rows.map((r) => r.room)).sort((a, b) => a.localeCompare(b, "ko")),
      instructors: uniq(rows.flatMap((r) => r.instructors)).sort((a, b) => a.localeCompare(b, "ko")),
    };
  }, [rows]);

  const all = (label: string) => ({ value: "", label });
  const active = Object.values(filters).filter(Boolean).length;

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <input
        className="field w-56 py-1"
        placeholder={t("timetable:filters.searchPlaceholder")}
        value={filters.q}
        onChange={(e) => onChange({ q: e.target.value })}
        aria-label={t("timetable:filters.searchPlaceholder")}
      />
      <Select
        label={t("timetable:filters.level")}
        value={filters.level}
        onChange={(v) => onChange({ level: v })}
        options={[
          all(t("timetable:filters.allLevels")),
          ...options.levels.map((v) => ({ value: v, label: domain.level(v) })),
        ]}
      />
      <Select
        label={t("timetable:filters.day")}
        value={filters.day}
        onChange={(v) => onChange({ day: v })}
        options={[
          all(t("timetable:filters.allDays")),
          ...options.days.map((v) => ({ value: v, label: t(`timetable:days.${v}`) })),
          ...(options.hasDayless ? [{ value: "none", label: t("timetable:noDay") }] : []),
        ]}
      />
      <Select
        label={t("timetable:filters.class")}
        value={filters.name}
        onChange={(v) => onChange({ name: v })}
        options={[
          all(t("timetable:filters.allClasses")),
          ...options.names.map((v) => ({ value: v, label: v })),
        ]}
      />
      <Select
        label={t("timetable:filters.room")}
        value={filters.room}
        onChange={(v) => onChange({ room: v })}
        options={[
          all(t("timetable:filters.allRooms")),
          ...options.rooms.map((v) => ({ value: v, label: v })),
        ]}
      />
      {options.instructors.length > 0 && (
        <Select
          label={t("timetable:instructors")}
          value={filters.instructor}
          onChange={(v) => onChange({ instructor: v })}
          options={[
            all(t("timetable:filters.allInstructors")),
            ...options.instructors.map((v) => ({ value: v, label: v })),
          ]}
        />
      )}
      {active > 0 && (
        <button type="button" className="btn py-1" onClick={onReset}>
          {t("timetable:filters.clear", { count: active })}
        </button>
      )}

      <span className="nums ml-auto text-xs text-muted">
        {t("timetable:filters.result", { classes: classCount, students: studentCount })}
      </span>
    </div>
  );
}

export function Timetable({ onDrill }: { onDrill: (filter: DrillFilter) => void }) {
  const { t } = useTranslation(["timetable", "common"]);
  const domain = useDomainLabel();
  const { data, isLoading, error } = useQuery({ queryKey: ["classes"], queryFn: api.classes });
  const [filters, setFilters] = useState<TimetableFilters>(EMPTY);

  const rows = useMemo(() => {
    return (data?.classes ?? [])
      .map((c) => applyFilters(c, filters))
      .filter((c): c is ClassGroupWithStudents => c !== null);
  }, [data, filters]);

  const grouped = useMemo(() => {
    const grad = rows.filter((c) => c.level === "대학원");
    const under = rows.filter((c) => c.level !== "대학원");
    // 학부는 요일별로 묶는다. 요일이 없는 반은 마지막에 따로 모은다.
    const byDay = CLASS_DAYS.map((day) => ({ day, classes: under.filter((c) => c.day === day) }))
      .filter((g) => g.classes.length > 0);
    const dayless = under.filter((c) => !c.day);
    return { grad, byDay, dayless };
  }, [rows]);

  if (isLoading) return <p className="p-6 text-sm text-muted">{t("timetable:loading")}</p>;
  if (error || !data) return <p className="p-6 text-sm text-critical">{t("timetable:loadError")}</p>;

  if (data.classes.length === 0) {
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <div className="card p-6">
          <h2 className="text-base font-bold">{t("timetable:empty.title")}</h2>
          <p className="mt-2 text-sm text-ink2">
            {t("timetable:empty.body", { year: data.year, semester: data.semester })}
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-plane p-3 text-xs text-ink2">
            node scripts/import-classes.mjs &quot;&lt;출석명부.xlsx&gt;&quot;
            &quot;&lt;반배정명단.xlsx&gt;&quot; --yes
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <p className="mb-3 text-xs text-muted">
        {t("timetable:term", { year: data.year, semester: data.semester })} ·{" "}
        {t("timetable:ourStudentsOnly")}
      </p>

      <TimetableFilterBar
        filters={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onReset={() => setFilters(EMPTY)}
        rows={data.classes}
        classCount={rows.length}
        studentCount={rows.reduce((n, c) => n + c.ourCount, 0)}
      />

      {rows.length === 0 && (
        <p className="card p-6 text-sm text-muted">{t("timetable:filters.noMatch")}</p>
      )}

      {grouped.grad.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-3 text-base font-bold">{domain.level("대학원")}</h2>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {grouped.grad.map((c) => (
              <ClassCard key={c._id} group={c} onDrill={onDrill} />
            ))}
          </div>
        </section>
      )}

      {(grouped.byDay.length > 0 || grouped.dayless.length > 0) && (
        <section className="mt-7">
          <h2 className="mb-3 text-base font-bold">{domain.level("학부")}</h2>
          {grouped.byDay.map(({ day, classes }) => (
            <div key={day} className="mt-4 first:mt-0">
              <h3 className="mb-2 text-sm font-bold text-ink2">
                {t(`timetable:days.${day}`)}
                <span className="ml-2 text-xs font-semibold text-muted">
                  {t("timetable:classCount", { count: classes.length })}
                </span>
              </h3>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {classes.map((c) => (
                  <ClassCard key={c._id} group={c} onDrill={onDrill} />
                ))}
              </div>
            </div>
          ))}
          {grouped.dayless.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-bold text-ink2">{t("timetable:noDay")}</h3>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {grouped.dayless.map((c) => (
                  <ClassCard key={c._id} group={c} onDrill={onDrill} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
