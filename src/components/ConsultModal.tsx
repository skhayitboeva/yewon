import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "./Modal";
import { api, ApiError } from "../api";
import { useLang } from "../i18n";
import {
  CONSULT_CATEGORIES,
  CONSULT_METHODS,
  type ConsultCategory,
  type Consultation,
  type Student,
} from "../../shared/domain";

const today = () => new Date().toISOString().slice(0, 10);

const BLANK = {
  date: today(),
  categories: [] as ConsultCategory[],
  method: "전화",
  content: "",
  result: "",
  counselor: "Saida",
};

export function ConsultModal({
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
  const { lang, t, tLevel } = useLang();
  const [form, setForm] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["consultations", student.studentId],
    queryFn: () => api.consultations(student.studentId),
  });

  const rows: Consultation[] = data?.rows ?? [];

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["consultations", student.studentId] });
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, studentId: student.studentId };
      return editingId
        ? api.patchConsultation(editingId, payload)
        : api.createConsultation(payload);
    },
    onSuccess: () => {
      onToast("ok", editingId ? t("상담 기록을 수정했습니다.") : t("상담 기록을 추가했습니다."));
      setForm({ ...BLANK });
      setEditingId(null);
      invalidate();
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? t(err.message) : t("저장에 실패했습니다.")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteConsultation(id),
    onSuccess: () => {
      onToast("ok", t("상담 기록을 삭제했습니다."));
      invalidate();
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? t(err.message) : t("삭제에 실패했습니다.")),
  });

  function toggleCategory(category: ConsultCategory) {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  }

  function startEdit(row: Consultation) {
    setEditingId(row._id);
    setForm({
      date: row.date,
      categories: row.categories,
      method: row.method || "대면",
      content: row.content || "",
      result: row.result || "",
      counselor: row.counselor || "",
    });
  }

  const canSave = form.categories.length > 0 && form.date.length === 10;

  return (
    <Modal
      title={lang === "en" ? `Consultation Record · ${student.nameKo}` : `상담 기록 · ${student.nameKo}`}
      subtitle={`${student.studentId} · ${tLevel(student.level)} · ${student.major || t("전공 미입력")}`}
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <button className="btn" onClick={onClose}>
          {t("닫기")}
        </button>
      }
    >
      {/* ------------------------------------------------------- 신규 작성 */}
      {!readOnly && (
      <div className="card bg-plane p-4">
        <h3 className="text-sm font-bold">
          {editingId ? t("상담 기록 수정") : t("새 상담 기록")}
        </h3>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className="label">{t("일자")}</label>
            <input
              type="date"
              className="field"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("상담 방법")}</label>
            <select
              className="field"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            >
              {CONSULT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t("담당자")}</label>
            <input
              className="field"
              value={form.counselor}
              onChange={(e) => setForm({ ...form, counselor: e.target.value })}
            />
          </div>
        </div>

        <fieldset className="mt-3">
          <legend className="label">{t("상담 분야 (복수 선택)")}</legend>
          <div className="flex flex-wrap gap-2">
            {CONSULT_CATEGORIES.map((c) => {
              const on = form.categories.includes(c);
              return (
                <label
                  key={c}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition
                    ${on ? "border-brand bg-[#eef3fa] text-brand" : "border-line bg-surface text-ink2 hover:bg-plane"}`}
                >
                  <input
                    type="checkbox"
                    className="accent-brand"
                    checked={on}
                    onChange={() => toggleCategory(c)}
                  />
                  {t(c)}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("상담 내용")}</label>
            <textarea
              className="field min-h-[96px]"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("조치 / 결과")}</label>
            <textarea
              className="field min-h-[96px]"
              value={form.result}
              onChange={(e) => setForm({ ...form, result: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          {editingId && (
            <button
              className="btn"
              onClick={() => {
                setEditingId(null);
                setForm({ ...BLANK });
              }}
            >
              {t("수정 취소")}
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t("저장 중…") : editingId ? t("수정 저장") : t("기록 추가")}
          </button>
        </div>
        {!canSave && (
          <p className="mt-2 text-right text-xs text-muted">
            {t("일자와 상담 분야를 선택해야 저장할 수 있습니다.")}
          </p>
        )}
      </div>
      )}

      {/* ---------------------------------------------------------- 이력 */}
      <h3 className="mt-5 text-sm font-bold">
        {lang === "en" ? "Record History" : "기록 이력"}{" "}
        <span className="text-muted">
          ({rows.length}
          {lang === "en" ? "" : "건"})
        </span>
      </h3>

      {isLoading ? (
        <p className="mt-3 text-sm text-muted">{t("불러오는 중…")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("아직 상담 기록이 없습니다.")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <li key={row._id} className="card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="nums text-sm font-bold">{row.date}</span>
                  {row.method && <span className="chip bg-plane text-ink2">{t(row.method)}</span>}
                  {row.categories.map((c) => (
                    <span key={c} className="chip bg-[#eef3fa] text-brand">
                      {t(c)}
                    </span>
                  ))}
                </div>
                {!readOnly && (
                  <div className="flex gap-1">
                    <button className="btn px-2 py-1 text-xs" onClick={() => startEdit(row)}>
                      {t("수정")}
                    </button>
                    <button
                      className="btn px-2 py-1 text-xs text-critical"
                      onClick={() => {
                        if (window.confirm(t("이 상담 기록을 삭제할까요?"))) remove.mutate(row._id);
                      }}
                    >
                      {t("삭제")}
                    </button>
                  </div>
                )}
              </div>

              {row.content && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{row.content}</p>
              )}
              {row.result && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink2">
                  <span className="font-semibold">
                    {lang === "en" ? "Action/Outcome · " : "조치/결과 · "}
                  </span>
                  {row.result}
                </p>
              )}
              {row.counselor && (
                <p className="mt-1 text-xs text-muted">
                  {t("담당자")} {row.counselor}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
