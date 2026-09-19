import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type StudentPage } from "../api";
import { EditableCell, SelectCell } from "./EditableCell";
import { TuitionCell } from "./TuitionCell";
import { Filters, EMPTY_FILTERS, type FilterState } from "./Filters";
import { AddStudentModal } from "./AddStudentModal";
import { ConsultModal } from "./ConsultModal";
import { COLUMNS, DEFAULT_VISIBLE, getPath, type ColumnDef } from "./columns";
import { useUrlState } from "../hooks";
import {
  ENROLL_STATUSES,
  STUDENT_TYPES,
  TUITION_STATUSES,
  type Student,
  type Tuition,
} from "../../shared/domain";

const PAGE_SIZES = [25, 50, 100, 200];

const DEFAULTS: Record<string, string> = {
  ...EMPTY_FILTERS,
  sort: "studentId",
  dir: "asc",
  page: "1",
  limit: "50",
};

function absenceTone(n: number): string {
  if (n >= 4) return "font-bold text-critical";
  if (n >= 2) return "font-semibold text-[#a8481f]";
  if (n >= 1) return "font-semibold text-[#8a6100]";
  return "";
}

export function StudentsTable({
  onToast,
  initialFilter,
}: {
  onToast: (kind: "ok" | "error", text: string) => void;
  initialFilter?: Record<string, string>;
}) {
  const [state, setState] = useUrlState({ ...DEFAULTS, ...(initialFilter ?? {}) });
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE);
  const [showColumns, setShowColumns] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [consultFor, setConsultFor] = useState<Student | null>(null);
  const qc = useQueryClient();

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) {
      if (value && value !== "") params.set(key, value);
    }
    return params.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(state)]);

  const queryKey = ["students", queryString] as const;
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.students(queryString),
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const cols = COLUMNS.filter((c) => visible.includes(c.key));

  /* ------------------------------------------------------- inline editing */

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patchStudent(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<StudentPage>(queryKey);
      qc.setQueryData<StudentPage>(queryKey, (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((r) =>
                r._id === id
                  ? {
                      ...r,
                      ...body,
                      tuition: body.tuition
                        ? { ...r.tuition, ...(body.tuition as Partial<Tuition>) }
                        : r.tuition,
                      attendance: body.attendance
                        ? { ...r.attendance, ...(body.attendance as any) }
                        : r.attendance,
                    }
                  : r
              ),
            }
          : old
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
      onToast("error", err instanceof ApiError ? err.message : "저장에 실패했습니다.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const bulk = useMutation({
    mutationFn: (set: Record<string, string>) =>
      api.bulkPatch({ ids: [...selected], set }),
    onSuccess: (res) => {
      onToast("ok", `${res.modified}명을 변경했습니다.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? err.message : "일괄 변경에 실패했습니다."),
  });

  const bulkAll = useMutation({
    mutationFn: (set: Record<string, string>) =>
      api.bulkPatch({ all: true, filter: filterOnly(state), set }),
    onSuccess: (res) => {
      onToast("ok", `필터 결과 ${res.modified}명을 변경했습니다.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? err.message : "일괄 변경에 실패했습니다."),
  });

  const removeStudent = useMutation({
    mutationFn: (id: string) => api.deleteStudent(id),
    onSuccess: () => {
      onToast("ok", "학생을 삭제했습니다.");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? err.message : "삭제에 실패했습니다."),
  });

  function save(student: Student, field: string, value: unknown) {
    const body: Record<string, unknown> = {};
    if (field.includes(".")) {
      const [parent, child] = field.split(".");
      body[parent] = { [child]: value };
    } else {
      body[field] = value;
    }
    patch.mutate({ id: student._id, body });
  }

  /* -------------------------------------------------------------- sorting */

  function toggleSort(col: ColumnDef) {
    if (!col.sortable) return;
    if (state.sort !== col.field) {
      setState({ sort: col.field, dir: "asc", page: "1" });
    } else if (state.dir === "asc") {
      setState({ dir: "desc" });
    } else {
      setState({ sort: "studentId", dir: "asc" });
    }
  }

  const sortMark = (col: ColumnDef) =>
    state.sort === col.field ? (state.dir === "desc" ? "▼" : "▲") : "";

  /* ------------------------------------------------------------ selection */

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r._id));

  function toggleAllOnPage() {
    const next = new Set(selected);
    if (allOnPageSelected) rows.forEach((r) => next.delete(r._id));
    else rows.forEach((r) => next.add(r._id));
    setSelected(next);
  }

  /* ---------------------------------------------------------------- render */

  const page = Number(state.page) || 1;
  const pages = data?.pages ?? 1;
  const exportHref = `/api/export.csv?${queryString}`;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
      <div className="card p-3">
        <Filters
          filters={filterOnly(state) as unknown as FilterState}
          onChange={(p) => setState({ ...p, page: "1" } as Record<string, string>)}
          onReset={() => setState({ ...EMPTY_FILTERS, page: "1" })}
          total={data?.total ?? 0}
          exportHref={exportHref}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <button className="btn btn-primary py-1" onClick={() => setAdding(true)}>
            + 학생 추가
          </button>

          <div className="relative">
            <button className="btn py-1" onClick={() => setShowColumns((v) => !v)}>
              열 표시 ({cols.length}/{COLUMNS.length})
            </button>
            {showColumns && (
              <div className="absolute left-0 z-30 mt-1 max-h-80 w-56 overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-xl">
                {COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-plane"
                  >
                    <input
                      type="checkbox"
                      className="accent-brand"
                      checked={visible.includes(c.key)}
                      onChange={() =>
                        setVisible((prev) =>
                          prev.includes(c.key)
                            ? prev.filter((k) => k !== c.key)
                            : COLUMNS.filter((x) => prev.includes(x.key) || x.key === c.key).map(
                                (x) => x.key
                              )
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
                <div className="mt-1 flex gap-1 border-t border-line pt-2">
                  <button className="btn flex-1 py-1 text-xs" onClick={() => setVisible(DEFAULT_VISIBLE)}>
                    기본값
                  </button>
                  <button
                    className="btn flex-1 py-1 text-xs"
                    onClick={() => setVisible(COLUMNS.map((c) => c.key))}
                  >
                    전체
                  </button>
                </div>
              </div>
            )}
          </div>

          <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-ink2">
            페이지당
            <select
              className="field w-auto py-1"
              value={state.limit}
              onChange={(e) => setState({ limit: e.target.value, page: "1" })}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ------------------------------------------------------ bulk bar */}
        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand bg-[#eef3fa] px-3 py-2">
            <span className="text-sm font-bold text-brand">{selected.size}명 선택됨</span>

            <select
              className="field w-auto py-1"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) bulk.mutate({ studentType: e.target.value });
                e.target.value = "";
              }}
            >
              <option value="">신입/재학 지정…</option>
              {STUDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}으로 변경
                </option>
              ))}
            </select>

            <select
              className="field w-auto py-1"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) bulk.mutate({ enrollStatus: e.target.value });
                e.target.value = "";
              }}
            >
              <option value="">학적 변경…</option>
              {ENROLL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}으로 변경
                </option>
              ))}
            </select>

            <select
              className="field w-auto py-1"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) bulk.mutate({ "tuition.status": e.target.value });
                e.target.value = "";
              }}
            >
              <option value="">등록금 상태 변경…</option>
              {TUITION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}으로 변경
                </option>
              ))}
            </select>

            <button className="btn py-1" onClick={() => setSelected(new Set())}>
              선택 해제
            </button>

            {data && data.total > rows.length && (
              <button
                className="btn py-1"
                onClick={() => {
                  const type = window.prompt(
                    `필터 결과 ${data.total}명 전체를 변경합니다.\n"신입생" 또는 "재학생" 을 입력하세요.`
                  );
                  if (type && STUDENT_TYPES.includes(type as any)) {
                    bulkAll.mutate({ studentType: type });
                  }
                }}
              >
                필터 결과 {data.total}명 전체에 적용…
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- table */}
      <div className="card mt-3 overflow-x-auto">
        {error ? (
          <p className="p-8 text-center text-sm text-critical">
            목록을 불러오지 못했습니다.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-plane text-left">
                <th className="sticky-col left-0 w-9 bg-plane px-2 py-2">
                  <input
                    type="checkbox"
                    className="accent-brand"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    aria-label="이 페이지 전체 선택"
                  />
                </th>
                {cols.map((col, i) => (
                  <th
                    key={col.key}
                    style={{
                      minWidth: col.width,
                      ...(col.sticky ? { left: 36 + cols.slice(0, i).reduce((a, c) => a + (c.sticky ? c.width : 0), 0) } : {}),
                    }}
                    className={`whitespace-nowrap px-2 py-2 text-xs font-bold text-ink2
                      ${col.align === "right" ? "text-right" : "text-left"}
                      ${col.sticky ? "sticky-col bg-plane" : ""}`}
                  >
                    {col.sortable ? (
                      <button
                        className="inline-flex items-center gap-1 hover:text-brand"
                        onClick={() => toggleSort(col)}
                      >
                        {col.label}
                        <span className="text-[9px] text-brand">{sortMark(col)}</span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                <th className="w-12 px-2 py-2" />
              </tr>
            </thead>

            <tbody>
              {isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2} className="p-8 text-center text-sm text-muted">
                    불러오는 중…
                  </td>
                </tr>
              )}

              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2} className="p-8 text-center text-sm text-muted">
                    조건에 맞는 학생이 없습니다.
                  </td>
                </tr>
              )}

              {rows.map((student) => (
                <tr
                  key={student._id}
                  className={`border-b border-line bg-surface last:border-0 hover:bg-[#fafbfd]
                    ${selected.has(student._id) ? "!bg-[#eef3fa]" : ""}`}
                >
                  <td className="sticky-col left-0 px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="accent-brand"
                      checked={selected.has(student._id)}
                      onChange={() => {
                        const next = new Set(selected);
                        next.has(student._id) ? next.delete(student._id) : next.add(student._id);
                        setSelected(next);
                      }}
                      aria-label={`${student.nameKo} 선택`}
                    />
                  </td>

                  {cols.map((col, i) => (
                    <td
                      key={col.key}
                      style={
                        col.sticky
                          ? { left: 36 + cols.slice(0, i).reduce((a, c) => a + (c.sticky ? c.width : 0), 0) }
                          : undefined
                      }
                      className={`relative px-2 py-1.5 align-middle
                        ${col.align === "right" ? "text-right" : ""}
                        ${col.sticky ? "sticky-col bg-inherit" : ""}`}
                    >
                      {renderCell(col, student, save)}
                    </td>
                  ))}

                  <td className="px-2 py-1.5 text-right">
                    <button
                      title="학생 삭제"
                      aria-label={`${student.nameKo} 삭제`}
                      className="rounded px-1.5 py-0.5 text-muted hover:bg-[#fbeaea] hover:text-critical"
                      onClick={() => {
                        if (
                          window.confirm(
                            `${student.nameKo}(${student.studentId}) 학생과 상담 기록을 모두 삭제합니다. 계속할까요?`
                          )
                        ) {
                          removeStudent.mutate(student._id);
                        }
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ----------------------------------------------------- pagination */}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button className="btn py-1" disabled={page <= 1} onClick={() => setState({ page: "1" })}>
            «
          </button>
          <button
            className="btn py-1"
            disabled={page <= 1}
            onClick={() => setState({ page: String(page - 1) })}
          >
            이전
          </button>
          <span className="nums px-2 text-sm text-ink2">
            {page} / {pages}
          </span>
          <button
            className="btn py-1"
            disabled={page >= pages}
            onClick={() => setState({ page: String(page + 1) })}
          >
            다음
          </button>
          <button
            className="btn py-1"
            disabled={page >= pages}
            onClick={() => setState({ page: String(pages) })}
          >
            »
          </button>
        </div>
      )}

      {adding && (
        <AddStudentModal
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            onToast("ok", "학생을 추가했습니다.");
            qc.invalidateQueries({ queryKey: ["students"] });
            qc.invalidateQueries({ queryKey: ["stats"] });
            qc.invalidateQueries({ queryKey: ["facets"] });
          }}
        />
      )}

      {consultFor && (
        <ConsultModal
          student={consultFor}
          onClose={() => setConsultFor(null)}
          onToast={onToast}
        />
      )}
    </div>
  );

  function renderCell(
    col: ColumnDef,
    student: Student,
    onSave: (s: Student, field: string, value: unknown) => void
  ) {
    switch (col.kind) {
      case "select":
        return (
          <SelectCell
            value={String(getPath(student, col.field) ?? "")}
            options={col.options ?? []}
            onSave={(v) => onSave(student, col.field, v)}
          />
        );

      case "tuition":
        return (
          <TuitionCell
            tuition={student.tuition}
            onSave={(p) => patch.mutate({ id: student._id, body: { tuition: p } })}
          />
        );

      case "consult":
        return (
          <button
            className="btn px-2 py-0.5 text-xs"
            onClick={() => setConsultFor(student)}
          >
            상담
            {(student.consultCount ?? 0) > 0 && (
              <span className="nums ml-1 rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
                {student.consultCount}
              </span>
            )}
          </button>
        );

      case "number": {
        const raw = Number(getPath(student, col.field) ?? 0);
        return (
          <span className={`nums block ${col.key === "absences" ? absenceTone(raw) : ""}`}>
            <EditableCell
              value={raw}
              kind="number"
              align="right"
              onSave={(v) => onSave(student, col.field, v)}
            />
          </span>
        );
      }

      default:
        return (
          <EditableCell
            value={String(getPath(student, col.field) ?? "")}
            kind={col.kind === "date" ? "date" : "text"}
            align={col.align ?? "left"}
            onSave={(v) => onSave(student, col.field, v)}
          />
        );
    }
  }
}

/** Strips sort/page/limit so only the real filters travel to the bulk endpoint. */
function filterOnly(state: Record<string, string>): Record<string, string> {
  const { sort, dir, page, limit, ...rest } = state;
  void sort;
  void dir;
  void page;
  void limit;
  return rest;
}
