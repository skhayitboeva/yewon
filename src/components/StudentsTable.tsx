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
import { useLang } from "../i18n";
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
  const { lang, t, tLevel, tEnrollStatus } = useLang();
  const [state, setState] = useUrlState({ ...DEFAULTS, ...(initialFilter ?? {}) });
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE);
  const [showColumns, setShowColumns] = useState(false);
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
      onToast("error", err instanceof ApiError ? t(err.message) : t("저장에 실패했습니다."));
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
      onToast("ok", t("학생을 삭제했습니다."));
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? t(err.message) : t("삭제에 실패했습니다.")),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => api.resetStudentPassword(id),
    onSuccess: () => {
      onToast("ok", t("비밀번호를 초기화했습니다."));
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? t(err.message) : t("초기화에 실패했습니다.")),
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
          exportHref={canWrite ? exportHref : undefined}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {canWrite && (
            <button className="btn btn-primary py-1" onClick={() => setAdding(true)}>
              + {t("학생 추가")}
            </button>
          )}

          <div className="relative">
            <button className="btn py-1" onClick={() => setShowColumns((v) => !v)}>
              {lang === "en" ? "Columns" : "열 표시"} ({cols.length}/{COLUMNS.length})
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
                    {lang === "en" ? c.labelEn : c.label}
                  </label>
                ))}
                <div className="mt-1 flex gap-1 border-t border-line pt-2">
                  <button className="btn flex-1 py-1 text-xs" onClick={() => setVisible(DEFAULT_VISIBLE)}>
                    {t("기본값")}
                  </button>
                  <button
                    className="btn flex-1 py-1 text-xs"
                    onClick={() => setVisible(COLUMNS.map((c) => c.key))}
                  >
                    {t("전체")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-ink2">
            {lang === "en" ? "Per page" : "페이지당"}
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
      <div className="card mt-3 overflow-x-auto">
        {error ? (
          <p className="p-8 text-center text-sm text-critical">
            {t("목록을 불러오지 못했습니다.")}
          </p>
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
                        {lang === "en" ? col.labelEn : col.label}
                        <span className="text-[9px] text-brand">{sortMark(col)}</span>
                      </button>
                    ) : lang === "en" ? (
                      col.labelEn
                    ) : (
                      col.label
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
                    {t("불러오는 중…")}
                  </td>
                </tr>
              )}

              {!isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={cols.length + (canWrite ? 1 : 0)}
                    className="p-8 text-center text-sm text-muted"
                  >
                    {t("조건에 맞는 학생이 없습니다.")}
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
                          title={t("비밀번호 초기화")}
                          className="rounded px-1.5 py-1 text-[11px] font-semibold text-muted hover:bg-plane hover:text-ink2"
                          onClick={() => {
                            if (
                              window.confirm(
                                lang === "en"
                                  ? `Reset the login password for ${student.nameKo} (${student.studentId})?`
                                  : `${student.nameKo}(${student.studentId}) 학생의 비밀번호를 초기화할까요?`
                              )
                            ) {
                              resetPassword.mutate(student._id);
                            }
                          }}
                        >
                          {t("비밀번호 초기화")}
                        </button>
                      )}
                      <button
                        title={lang === "en" ? "Delete student" : "학생 삭제"}
                        aria-label={lang === "en" ? `Delete ${student.nameKo}` : `${student.nameKo} 삭제`}
                        className="rounded p-1 text-muted hover:bg-[#fbeaea] hover:text-critical"
                        onClick={() => {
                          if (
                            window.confirm(
                              lang === "en"
                                ? `This will delete ${student.nameKo} (${student.studentId}). Continue?`
                                : `${student.nameKo}(${student.studentId}) 학생을 삭제됩니다. 계속할까요?`
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
            {t("이전")}
          </button>
          <span className="nums px-2 text-sm text-ink2">
            {page} / {pages}
          </span>
          <button
            className="btn py-1"
            disabled={page >= pages}
            onClick={() => setState({ page: String(page + 1) })}
          >
            {t("다음")}
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
            onToast("ok", t("학생을 추가했습니다."));
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
              col.key === "level" ? tLevel : col.key === "enrollStatus" ? tEnrollStatus : t
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
            {t("상담")}
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
