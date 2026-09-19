import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useDebounced } from "../hooks";
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
const list = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

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
  exportHref: string;
}) {
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
        placeholder="학번 · 성명 · 영문명 · 연락처"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="검색"
      />

      <Select
        label="구분"
        value={filters.level}
        onChange={(v) => onChange({ level: v })}
        options={[all("구분 전체"), ...list(LEVELS)]}
      />
      <Select
        label="신입/재학"
        value={filters.studentType}
        onChange={(v) => onChange({ studentType: v })}
        options={[all("신입/재학 전체"), ...list(STUDENT_TYPES)]}
      />
      <Select
        label="전공"
        value={filters.major}
        onChange={(v) => onChange({ major: v })}
        options={[all("전공 전체"), ...list(facets?.majors ?? [])]}
      />
      <Select
        label="학적"
        value={filters.enrollStatus}
        onChange={(v) => onChange({ enrollStatus: v })}
        options={[all("학적 전체"), ...list(ENROLL_STATUSES)]}
      />
      <Select
        label="등록금"
        value={filters.tuitionStatus}
        onChange={(v) => onChange({ tuitionStatus: v })}
        options={[all("등록금 전체"), ...list(TUITION_STATUSES)]}
      />
      <Select
        label="납부 차수"
        value={filters.term}
        onChange={(v) => onChange({ term: v })}
        options={[
          all("납부 차수 전체"),
          ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n}차 납부함` })),
        ]}
      />
      <Select
        label="출결"
        value={filters.absence}
        onChange={(v) => onChange({ absence: v })}
        options={[
          all("출결 전체"),
          ...ABSENCE_BUCKETS.map((b) => ({ value: b.key, label: b.label })),
        ]}
      />
      <Select
        label="입학 코호트"
        value={filters.cohort}
        onChange={(v) => onChange({ cohort: v })}
        options={[all("입학 코호트 전체"), ...list(facets?.cohorts ?? [])]}
      />

      {active > 0 && (
        <button className="btn py-1" onClick={onReset}>
          필터 해제 ({active})
        </button>
      )}

      <span className="nums ml-auto text-sm text-ink2">
        <b>{total.toLocaleString("ko-KR")}</b>명
      </span>
      <a className="btn py-1" href={exportHref}>
        CSV 내보내기
      </a>
    </div>
  );
}
