import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { useDebounced } from "../hooks";
import { useDomainLabel } from "../i18n/domainLabels";
import {
  ABSENCE_BUCKETS,
  ENROLL_STATUSES,
  LEVELS,
  STUDENT_TYPES,
  TUITION_STATUSES,
} from "../../shared/domain";

export interface FilterState {
  q: string;
  level: string;
  studentType: string;
  major: string;
  enrollStatus: string;
  tuitionStatus: string;
  term: string;
  absence: string;
  cohort: string;
}

export const EMPTY_FILTERS: FilterState = {
  q: "",
  level: "",
  studentType: "",
  major: "",
  enrollStatus: "",
  tuitionStatus: "",
  term: "",
  absence: "",
  cohort: "",
};

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold text-ink2">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        className="field w-auto py-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const all = (label: string) => ({ value: "", label });
const list = (values: readonly string[], translate: (v: string) => string = (v) => v) =>
  values.map((v) => ({ value: v, label: translate(v) }));

export function Filters({
  filters,
  onChange,
  onReset,
  total,
  exportHref,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  total: number;
  exportHref?: string;
}) {
  const { t } = useTranslation(["filters", "common"]);
  const domain = useDomainLabel();
  const [search, setSearch] = useState(filters.q);
  const debounced = useDebounced(search, 300);

  useEffect(() => {
    if (debounced !== filters.q) onChange({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    setSearch(filters.q);
  }, [filters.q]);

  const { data: facets } = useQuery({ queryKey: ["facets"], queryFn: api.facets });

  const active = Object.entries(filters).filter(([, v]) => v).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className="field w-56 py-1"
        placeholder={t("filters:searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label={t("common:actions.search")}
      />

      <Select
        label={t("filters:level.label")}
        value={filters.level}
        onChange={(v) => onChange({ level: v })}
        options={[all(t("filters:level.all")), ...list(LEVELS, domain.level)]}
      />
      <Select
        label={t("filters:studentType.label")}
        value={filters.studentType}
        onChange={(v) => onChange({ studentType: v })}
        options={[all(t("filters:studentType.all")), ...list(STUDENT_TYPES, domain.studentType)]}
      />
      <Select
        label={t("filters:major.label")}
        value={filters.major}
        onChange={(v) => onChange({ major: v })}
        options={[all(t("filters:major.all")), ...list(facets?.majors ?? [])]}
      />
      <Select
        label={t("filters:enrollStatus.label")}
        value={filters.enrollStatus}
        onChange={(v) => onChange({ enrollStatus: v })}
        options={[all(t("filters:enrollStatus.all")), ...list(ENROLL_STATUSES, domain.enrollStatus)]}
      />
      <Select
        label={t("filters:tuitionStatus.label")}
        value={filters.tuitionStatus}
        onChange={(v) => onChange({ tuitionStatus: v })}
        options={[all(t("filters:tuitionStatus.all")), ...list(TUITION_STATUSES, domain.tuitionStatus)]}
      />
      <Select
        label={t("filters:term.label")}
        value={filters.term}
        onChange={(v) => onChange({ term: v })}
        options={[
          all(t("filters:term.all")),
          ...[1, 2, 3, 4].map((n) => ({
            value: String(n),
            label: t("filters:term.paid", { n }),
          })),
        ]}
      />
      <Select
        label={t("filters:attendance.label")}
        value={filters.absence}
        onChange={(v) => onChange({ absence: v })}
        options={[
          all(t("filters:attendance.all")),
          ...ABSENCE_BUCKETS.map((b) => ({ value: b.key, label: domain.absenceBucket(b.key) })),
        ]}
      />
      <Select
        label={t("filters:cohort.label")}
        value={filters.cohort}
        onChange={(v) => onChange({ cohort: v })}
        options={[all(t("filters:cohort.all")), ...list(facets?.cohorts ?? [])]}
      />

      {active > 0 && (
        <button className="btn py-1" onClick={onReset}>
          {t("common:actions.clearFilters")} ({active})
        </button>
      )}

      <span className="nums ml-auto text-sm text-ink2">
        <b>{total.toLocaleString("ko-KR")}</b>
        {t("common:units.students")}
      </span>
      {exportHref && (
        <a className="btn py-1" href={exportHref}>
          {t("filters:exportCsv")}
        </a>
      )}
    </div>
  );
}
