import { Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError, type AttendanceRecordResponse, type StudentPage } from "../api";
import { tError } from "../i18n";
import {
  ATTENDANCE_MODES,
  WEEK_KEYS,
  attendanceTotals,
  nextMark,
  type AttendanceMark,
  type AttendanceMode,
  type Student,
  type WeekCells,
} from "../../shared/domain";

/** 학생 목록의 행 펼침과 출결 모달이 같은 데이터/그리드를 쓴다.
 *
 * `id` 는 학번이 아니라 **Mongo _id** 다 — 다른 학생 엔드포인트
 * (/api/students/:id, .../reset-password)와 같은 규칙. 저장되는 문서 자체는
 * 학번으로 묶이지만(consultations 와 동일) 그 변환은 서버가 한다. */
export function useWeeklyAttendance(
  id: string,
  opts: { enabled?: boolean; onToast?: (kind: "ok" | "error", text: string) => void } = {}
) {
  const qc = useQueryClient();
  const key = ["weeklyAttendance", id] as const;
  const rosterKey = ["students", "all"] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.studentAttendance(id),
    enabled: opts.enabled ?? true,
    // 여러 직원이 동시에 편집할 수 있으므로 캐시를 신선하다고 가정하지 않는다.
    staleTime: 0,
  });

  function writeRosterTotals(totals: AttendanceRecordResponse["totals"]) {
    qc.setQueryData<StudentPage>(rosterKey, (old) =>
      old
        ? {
            ...old,
            rows: old.rows.map((r) =>
              r._id === id
                ? {
                    ...r,
                    attendance: {
                      ...r.attendance,
                      absences: totals.absences,
                      late: totals.late,
                      absencesOffline: totals.offline.absences,
                      absencesOnline: totals.online.absences,
                      lateOffline: totals.offline.late,
                      lateOnline: totals.online.late,
                      riskAbsences: totals.riskAbsences,
                    },
                  }
                : r
            ),
          }
        : old
    );
  }

  const toggle = useMutation({
    mutationFn: (m: { week: number; mode: AttendanceMode; value: AttendanceMark }) =>
      api.patchStudentAttendance(id, [m]),
    onMutate: async (m) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AttendanceRecordResponse>(key);
      if (previous) {
        const weeks = {
          ...previous.record.weeks,
          [m.week]: { ...previous.record.weeks[String(m.week)], [m.mode]: m.value },
        };
        const totals = attendanceTotals(weeks);
        qc.setQueryData<AttendanceRecordResponse>(key, {
          ...previous,
          record: { ...previous.record, weeks },
          totals,
        });
        writeRosterTotals(totals);
      }
      return { previous };
    },
    onError: (err, _m, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      opts.onToast?.(
        "error",
        err instanceof ApiError ? tError(err.message) : tError("저장에 실패했습니다.")
      );
    },
    onSuccess: (res) => {
      qc.setQueryData(key, res); // 서버가 확정한 문서로 맞춘다
      writeRosterTotals(res.totals);
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const clearAll = useMutation({
    mutationFn: () =>
      api.patchStudentAttendance(
        id,
        WEEK_KEYS.flatMap((w) =>
          ATTENDANCE_MODES.map((mode) => ({ week: Number(w), mode, value: null as AttendanceMark }))
        )
      ),
    onSuccess: (res) => {
      qc.setQueryData(key, res);
      writeRosterTotals(res.totals);
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) =>
      opts.onToast?.(
        "error",
        err instanceof ApiError ? tError(err.message) : tError("저장에 실패했습니다.")
      ),
  });

  return { query, toggle, clearAll };
}

const MODE_LABEL_KEY: Record<AttendanceMode, string> = {
  offline: "offline",
  online: "online",
};

function markGlyph(mark: AttendanceMark): string {
  return mark === "absent" ? "A" : mark === "late" ? "L" : "";
}

function markTone(mark: AttendanceMark): string {
  if (mark === "absent") return "border-critical/40 bg-[#fbeaea] text-critical";
  if (mark === "late") return "border-[#e9c77a] bg-[#fdf3dd] text-[#8a6100]";
  return "border-line bg-surface text-muted";
}

export function AttendanceGrid({
  weeks,
  onToggle,
  readOnly = false,
  pendingCell,
}: {
  weeks: Record<string, WeekCells>;
  onToggle: (week: number, mode: AttendanceMode, next: AttendanceMark) => void;
  readOnly?: boolean;
  pendingCell?: { week: number; mode: AttendanceMode } | null;
}) {
  const { t } = useTranslation("modals");

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `72px repeat(${WEEK_KEYS.length}, minmax(28px, 1fr))` }}
      >
        <div />
        {WEEK_KEYS.map((w) => (
          <div key={w} className="nums text-center text-[10px] font-bold text-muted">
            {w}
          </div>
        ))}

        {ATTENDANCE_MODES.map((mode) => (
          <Fragment key={mode}>
            <div className="flex items-center text-xs font-bold text-ink2">
              {t(`attendance.${MODE_LABEL_KEY[mode]}`)}
            </div>
            {WEEK_KEYS.map((w) => {
              const mark = weeks[w]?.[mode] ?? null;
              const pending =
                pendingCell?.week === Number(w) && pendingCell?.mode === mode;
              return (
                <button
                  key={`${mode}-${w}`}
                  type="button"
                  disabled={readOnly}
                  aria-label={t("attendance.cellAria", {
                    n: w,
                    mode: t(`attendance.${MODE_LABEL_KEY[mode]}`),
                    state: t(`attendance.${mark ?? "present"}`),
                  })}
                  title={t("attendance.cellAria", {
                    n: w,
                    mode: t(`attendance.${MODE_LABEL_KEY[mode]}`),
                    state: t(`attendance.${mark ?? "present"}`),
                  })}
                  onClick={() => onToggle(Number(w), mode, nextMark(mark))}
                  className={`nums h-7 w-full rounded border text-xs font-bold transition
                    ${markTone(mark)}
                    ${pending ? "opacity-50" : ""}
                    ${readOnly ? "cursor-default" : "cursor-pointer hover:brightness-95"}`}
                >
                  {markGlyph(mark)}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** 그리드 + 학기 표시 + 총계 + 비고 경고 — 행 펼침과 모달이 함께 쓴다. */
export function AttendancePanel({
  student,
  readOnly,
  onToast,
  onOpenFull,
}: {
  student: Student;
  readOnly: boolean;
  onToast: (kind: "ok" | "error", text: string) => void;
  /** 있으면 헤더에 "전체 보기" 버튼이 나온다. 모달에서는 넘기지 않는다. */
  onOpenFull?: () => void;
}) {
  const { t } = useTranslation(["modals", "common"]);
  const { query, toggle, clearAll } = useWeeklyAttendance(student._id, { onToast });

  const data = query.data;
  const totals = data?.totals;
  const legacy = data?.record.source === "legacy-import";

  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold">{t("attendance.title", { name: student.nameKo })}</h4>
          {legacy && (
            <span className="chip bg-[#fdf3dd] text-[#8a6100]" title={t("attendance.legacyNotice")}>
              {t("attendance.legacyBadge")}
            </span>
          )}
        </div>
        {onOpenFull && (
          <button className="btn px-2 py-1 text-xs" onClick={onOpenFull}>
            {t("attendance.openFull")}
          </button>
        )}
      </div>

      {query.isLoading ? (
        <p className="mt-3 text-sm text-muted">{t("common:states.loading")}</p>
      ) : query.isError || !data ? (
        <p className="mt-3 text-sm text-critical">{t("attendance.loadError")}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">{t("attendance.hint")}</p>

          <div className="mt-3">
            <AttendanceGrid
              weeks={data.record.weeks}
              readOnly={readOnly}
              pendingCell={
                toggle.isPending && toggle.variables
                  ? { week: toggle.variables.week, mode: toggle.variables.mode }
                  : null
              }
              onToggle={(week, mode, value) => toggle.mutate({ week, mode, value })}
            />
          </div>

          {totals && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className={totals.offline.absences >= 4 ? "font-bold text-critical" : "text-ink2"}>
                {t("attendance.totalsByMode", {
                  mode: t("attendance.offline"),
                  absences: totals.offline.absences,
                  late: totals.offline.late,
                })}
              </span>
              <span className={totals.online.absences >= 4 ? "font-bold text-critical" : "text-ink2"}>
                {t("attendance.totalsByMode", {
                  mode: t("attendance.online"),
                  absences: totals.online.absences,
                  late: totals.online.late,
                })}
              </span>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              {data?.record.updatedAt
                ? t("attendance.updatedMeta", {
                    at: new Date(data.record.updatedAt).toLocaleString(),
                  })
                : t("attendance.emptyState")}
            </span>
            {!readOnly && (
              <button
                className="btn px-2 py-1 text-xs text-critical"
                disabled={clearAll.isPending}
                onClick={() => {
                  if (window.confirm(t("attendance.confirmClear", { name: student.nameKo }))) {
                    clearAll.mutate();
                  }
                }}
              >
                {t("attendance.clearAll")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
