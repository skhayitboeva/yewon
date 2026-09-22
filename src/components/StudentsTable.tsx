import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError, type StudentPage } from "../api";
import { tError } from "../i18n";
import { useDomainLabel } from "../i18n/domainLabels";
import { EditableCell, SelectCell } from "./EditableCell";
import { TuitionCell } from "./TuitionCell";
import { Filters, EMPTY_FILTERS, type FilterState } from "./Filters";
import { AddStudentModal } from "./AddStudentModal";
import { ConsultModal } from "./ConsultModal";
import { COLUMNS, DEFAULT_VISIBLE, getPath, type ColumnDef } from "./columns";
import { useUrlState } from "../hooks";
import { filterStudents, paginate, sortStudents } from "../lib/studentFilter";
import { type Role, type Student, type Tuition } from "../../shared/domain";

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

function TrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h12" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6" />
      <path d="M5.5 6l.6 9.6A1.5 1.5 0 0 0 7.6 17h4.8a1.5 1.5 0 0 0 1.5-1.4L14.5 6" />
      <path d="M8.3 9v5" />
      <path d="M11.7 9v5" />
    </svg>
  );
}

export function StudentsTable({
  onToast,
  initialFilter,
  role,
}: {
  onToast: (kind: "ok" | "error", text: string) => void;
  initialFilter?: Record<string, string>;
  role: Role;
}) {
  const canWrite = role === "admin";
  const { t } = useTranslation(["students", "common"]);
  const domain = useDomainLabel();
  const [state, setState] = useUrlState({ ...DEFAULTS, ...(initialFilter ?? {}) });
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE);
  const [showColumns, setShowColumns] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [consultFor, setConsultFor] = useState<Student | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!showColumns) return;
    function onOutside(e: MouseEvent) {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setShowColumns(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [showColumns]);

  // Kept only for the CSV export link, which still filters server-side.
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) {
      if (value && value !== "") params.set(key, value);
    }
    return params.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(state)]);

  // The full roster is fetched once and cached; search/filter/sort/page all
  // run in memory against it instead of round-tripping per keystroke.
  const queryKey = ["students", "all"] as const;
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.students("all=1"),
    staleTime: 60_000,
  });

  const allRows = data?.rows ?? [];
  const filtered = useMemo(
    () => filterStudents(allRows, filterOnly(state)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, JSON.stringify(filterOnly(state))]
  );
  const sorted = useMemo(
    () => sortStudents(filtered, state.sort, state.dir),
    [filtered, state.sort, state.dir]
  );

  const total = sorted.length;
  const limit = Number(state.limit) || 50;
  const page = Number(state.page) || 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  const rows = useMemo(() => paginate(sorted, page, limit), [sorted, page, limit]);
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
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("저장에 실패했습니다."));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  // Soft delete: the record stays in the database with enrollStatus "삭제"
  // rather than being removed, so it can be filtered to or reverted later.
  const markDeleted = useMutation({
    mutationFn: (id: string) => api.patchStudent(id, { enrollStatus: "삭제" }),
    onSuccess: () => {
      onToast("ok", t("students:table.deletedToast"));
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("삭제에 실패했습니다.")),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => api.resetStudentPassword(id),
    onSuccess: () => {
      onToast("ok", t("students:table.resetPasswordToast"));
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("초기화에 실패했습니다.")),
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

  /* ---------------------------------------------------------------- render */

  const exportHref = `/api/export.csv?${queryString}`;
  const colLabel = (col: ColumnDef) => t(`students:columns.${col.labelKey}`);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
      <div className="card p-3">
        <Filters
          filters={filterOnly(state) as unknown as FilterState}
          onChange={(p) => setState({ ...p, page: "1" } as Record<string, string>)}
          onReset={() => setState({ ...EMPTY_FILTERS, page: "1" })}
          total={total}
          exportHref={canWrite ? exportHref : undefined}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {canWrite && (
            <button className="btn btn-primary py-1" onClick={() => setAdding(true)}>
              + {t("students:toolbar.addStudent")}
            </button>
          )}

          <div className="relative" ref={columnsRef}>
            <button className="btn py-1" onClick={() => setShowColumns((v) => !v)}>
              {t("students:toolbar.columnsButton")} ({cols.length}/{COLUMNS.length})
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
                    {colLabel(c)}
                  </label>
                ))}
                <div className="mt-1 flex gap-1 border-t border-line pt-2">
                  <button className="btn flex-1 py-1 text-xs" onClick={() => setVisible(DEFAULT_VISIBLE)}>
                    {t("students:toolbar.resetToDefault")}
                  </button>
                  <button
                    className="btn flex-1 py-1 text-xs"
                    onClick={() => setVisible(COLUMNS.map((c) => c.key))}
                  >
                    {t("students:toolbar.showAll")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-ink2">
            {t("students:toolbar.perPage")}
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
      </div>

      {/* ---------------------------------------------------------- table */}
      <div className="card mt-3 min-h-[280px] overflow-x-auto">
        {error ? (
          <p className="p-8 text-center text-sm text-critical">{t("students:table.loadError")}</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-plane text-left">
                {cols.map((col, i) => (
                  <th
                    key={col.key}
                    style={{
                      width: col.width,
                      ...(col.sticky ? { left: cols.slice(0, i).reduce((a, c) => a + (c.sticky ? c.width : 0), 0) } : {}),
                    }}
                    className={`overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2 text-xs font-bold text-ink2
                      ${col.align === "right" ? "text-right" : "text-left"}
                      ${col.sticky ? "sticky-col bg-plane" : ""}
                      ${col.key === "nameEn" ? "border-r-2 border-rule" : ""}`}
                  >
                    {col.sortable ? (
                      <button
                        className="inline-flex items-center gap-1 hover:text-brand"
                        onClick={() => toggleSort(col)}
                      >
                        {colLabel(col)}
                        <span className="text-[9px] text-brand">{sortMark(col)}</span>
                      </button>
                    ) : (
                      colLabel(col)
                    )}
                  </th>
                ))}
                {canWrite && <th className="w-12 px-2 py-2" />}
              </tr>
            </thead>

            <tbody>
              {isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={cols.length + (canWrite ? 1 : 0)}
                    className="p-8 text-center text-sm text-muted"
                  >
                    {t("students:table.loading")}
                  </td>
                </tr>
              )}

              {!isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={cols.length + (canWrite ? 1 : 0)}
                    className="p-8 text-center text-sm text-muted"
                  >
                    {t("students:table.noResults")}
                  </td>
                </tr>
              )}

              {rows.map((student) => (
                <tr
                  key={student._id}
                  className="border-b border-line bg-surface last:border-0 hover:bg-[#fafbfd]"
                >
                  {cols.map((col, i) => (
                    <td
                      key={col.key}
                      style={
                        col.sticky
                          ? { left: cols.slice(0, i).reduce((a, c) => a + (c.sticky ? c.width : 0), 0) }
                          : undefined
                      }
                      className={`relative px-2 py-1.5 align-middle
                        ${col.align === "right" ? "text-right" : ""}
                        ${col.sticky ? "sticky-col bg-inherit" : ""}
                        ${col.key === "nameEn" ? "border-r-2 border-rule" : ""}`}
                    >
                      {renderCell(col, student, save, !canWrite)}
                    </td>
                  ))}

                  {canWrite && (
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                      {student.hasPassword && (
                        <button
                          title={t("students:table.resetPassword")}
                          className="rounded px-1.5 py-1 text-[11px] font-semibold text-muted hover:bg-plane hover:text-ink2"
                          onClick={() => {
                            if (
                              window.confirm(
                                t("students:table.confirmResetPassword", {
                                  name: student.nameKo,
                                  studentId: student.studentId,
                                })
                              )
                            ) {
                              resetPassword.mutate(student._id);
                            }
                          }}
                        >
                          {t("students:table.resetPassword")}
                        </button>
                      )}
                      <button
                        title={t("students:table.deleteStudent")}
                        aria-label={t("students:table.deleteAriaLabel", { name: student.nameKo })}
                        className="rounded p-1 text-muted hover:bg-[#fbeaea] hover:text-critical"
                        onClick={() => {
                          if (
                            window.confirm(
                              t("students:table.confirmDelete", {
                                name: student.nameKo,
                                studentId: student.studentId,
                              })
                            )
                          ) {
                            markDeleted.mutate(student._id);
                          }
                        }}
                      >
                        <TrashIcon />
                      </button>
                      </div>
                    </td>
                  )}
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
            {t("common:actions.previous")}
          </button>
          <span className="nums px-2 text-sm text-ink2">
            {page} / {pages}
          </span>
          <button
            className="btn py-1"
            disabled={page >= pages}
            onClick={() => setState({ page: String(page + 1) })}
          >
            {t("common:actions.next")}
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
            onToast("ok", t("students:table.createdToast"));
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
          readOnly={!canWrite}
        />
      )}
    </div>
  );

  function renderCell(
    col: ColumnDef,
    student: Student,
    onSave: (s: Student, field: string, value: unknown) => void,
    readOnly: boolean
  ) {
    switch (col.kind) {
      case "select":
        return (
          <SelectCell
            value={String(getPath(student, col.field) ?? "")}
            options={col.options ?? []}
            renderLabel={
              col.key === "level"
                ? domain.level
                : col.key === "enrollStatus"
                  ? domain.enrollStatus
                  : col.key === "studentType"
                    ? domain.studentType
                    : col.key === "gender"
                      ? domain.gender
                      : col.key === "admissionType"
                        ? domain.admissionType
                        : col.key === "course"
                          ? domain.course
                          : (v: string) => v
            }
            onSave={(v) => onSave(student, col.field, v)}
            readOnly={readOnly}
          />
        );

      case "tuition":
        return (
          <TuitionCell
            tuition={student.tuition}
            onSave={(p) => patch.mutate({ id: student._id, body: { tuition: p } })}
            readOnly={readOnly}
          />
        );

      case "consult":
        return (
          <button
            className="btn px-2 py-0.5 text-xs"
            onClick={() => setConsultFor(student)}
          >
            {t("students:table.consultButton")}
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
              readOnly={readOnly}
            />
          </span>
        );
      }

      default:
        return (
          <EditableCell
            value={String(getPath(student, col.field) ?? "")}
            kind={
              col.kind === "date"
                ? "date"
                : col.key === "mobile" || col.key === "phone"
                  ? "phone"
                  : "text"
            }
            align={col.align ?? "left"}
            onSave={(v) => onSave(student, col.field, v)}
            readOnly={readOnly}
          />
        );
    }
  }
}

/** Strips sort/page/limit so the Filters component only sees the real filter values. */
function filterOnly(state: Record<string, string>): Record<string, string> {
  const { sort, dir, page, limit, ...rest } = state;
  void sort;
  void dir;
  void page;
  void limit;
  return rest;
}
