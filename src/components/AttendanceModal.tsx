import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { AttendancePanel, useWeeklyAttendance } from "./AttendanceGrid";
import { api, ApiError } from "../api";
import { tError } from "../i18n";
import { useDomainLabel } from "../i18n/domainLabels";
import { ATTENDANCE_MODES, WEEK_KEYS, type AttendanceMode, type Student } from "../../shared/domain";

const MODE_LABEL_KEY: Record<AttendanceMode, string> = { offline: "offline", online: "online" };

export function AttendanceModal({
  student,
  onClose,
  onToast,
  readOnly = false,
}: {
  student: Student;
  onClose: () => void;
  onToast: (kind: "ok" | "error", text: string) => void;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const { t } = useTranslation(["modals", "common"]);
  const domain = useDomainLabel();
  const { query } = useWeeklyAttendance(student._id, { onToast });
  const [note, setNote] = useState(student.attendance.note ?? "");

  useEffect(() => {
    setNote(student.attendance.note ?? "");
  }, [student._id, student.attendance.note]);

  const saveNote = useMutation({
    mutationFn: () => api.patchStudent(student._id, { attendance: { note } }),
    onSuccess: () => {
      onToast("ok", t("attendance.noteSavedToast"));
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("저장에 실패했습니다.")),
  });

  const weeks = query.data?.record.weeks;
  const markedWeeks = weeks
    ? WEEK_KEYS.flatMap((w) =>
        ATTENDANCE_MODES.flatMap((mode) => {
          const mark = weeks[w]?.[mode];
          if (!mark) return [];
          return [{ week: Number(w), mode, mark }];
        })
      ).sort((a, b) => a.week - b.week)
    : [];

  return (
    <Modal
      title={t("attendance.title", { name: student.nameKo })}
      subtitle={`${student.studentId} · ${domain.level(student.level)} · ${student.major || t("modals:consult.majorMissing")}`}
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <button className="btn" onClick={onClose}>
          {t("common:actions.close")}
        </button>
      }
    >
      <AttendancePanel student={student} readOnly={readOnly} onToast={onToast} />

      {/* ---------------------------------------------------------- 이력 */}
      <h3 className="mt-5 text-sm font-bold">
        {t("attendance.historyTitle")}{" "}
        <span className="text-muted">{t("attendance.historyCount", { count: markedWeeks.length })}</span>
      </h3>
      {markedWeeks.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("attendance.emptyState")}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {markedWeeks.map(({ week, mode, mark }) => (
            <li
              key={`${mode}-${week}`}
              className={`chip ${mark === "absent" ? "bg-[#fbeaea] text-critical" : "bg-[#fdf3dd] text-[#8a6100]"}`}
            >
              {t("attendance.historyItem", {
                week,
                mode: t(`attendance.${MODE_LABEL_KEY[mode]}`),
                mark: t(`attendance.${mark}`),
              })}
            </li>
          ))}
        </ul>
      )}

      {/* -------------------------------------------------------- 비고 */}
      <div className="mt-5">
        <label className="label">{t("attendance.noteLabel")}</label>
        <textarea
          className="field min-h-[80px]"
          value={note}
          disabled={readOnly}
          onChange={(e) => setNote(e.target.value)}
        />
        {!readOnly && (
          <div className="mt-2 flex justify-end">
            <button
              className="btn btn-primary px-3 py-1 text-xs"
              disabled={saveNote.isPending || note === (student.attendance.note ?? "")}
              onClick={() => saveNote.mutate()}
            >
              {t("common:actions.save")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
