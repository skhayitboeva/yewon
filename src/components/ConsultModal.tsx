import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { api, ApiError } from "../api";
import { tError } from "../i18n";
import { useDomainLabel } from "../i18n/domainLabels";
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
  const { t } = useTranslation(["modals", "common"]);
  const domain = useDomainLabel();
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
      onToast(
        "ok",
        editingId ? t("modals:consult.updatedToast") : t("modals:consult.createdToast")
      );
      setForm({ ...BLANK });
      setEditingId(null);
      invalidate();
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("저장에 실패했습니다.")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteConsultation(id),
    onSuccess: () => {
      onToast("ok", t("modals:consult.deletedToast"));
      invalidate();
    },
    onError: (err) =>
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("삭제에 실패했습니다.")),
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
      title={t("modals:consult.titleWithName", { name: student.nameKo })}
      subtitle={`${student.studentId} · ${domain.level(student.level)} · ${student.major || t("modals:consult.majorMissing")}`}
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <button className="btn" onClick={onClose}>
          {t("common:actions.close")}
        </button>
      }
    >
      {/* ------------------------------------------------------- 신규 작성 */}
      {!readOnly && (
      <div className="card bg-plane p-4">
        <h3 className="text-sm font-bold">
          {editingId ? t("modals:consult.editRecord") : t("modals:consult.newRecord")}
        </h3>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className="label">{t("modals:consult.dateLabel")}</label>
            <input
              type="date"
              className="field"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("modals:consult.methodLabel")}</label>
            <select
              className="field"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            >
              {CONSULT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {domain.consultMethod(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t("modals:consult.counselorLabel")}</label>
            <input
              className="field"
              value={form.counselor}
              onChange={(e) => setForm({ ...form, counselor: e.target.value })}
            />
          </div>
        </div>

        <fieldset className="mt-3">
          <legend className="label">{t("modals:consult.categoriesLabel")}</legend>
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
                  {domain.consultCategory(c)}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("modals:consult.contentLabel")}</label>
            <textarea
              className="field min-h-[96px]"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("modals:consult.resultLabel")}</label>
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
              {t("modals:consult.cancelEdit")}
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Loading…" : editingId ? t("modals:consult.saveChanges") : t("modals:consult.addRecord")}
          </button>
        </div>
        {!canSave && (
          <p className="mt-2 text-right text-xs text-muted">{t("modals:consult.saveHint")}</p>
        )}
      </div>
      )}

      {/* ---------------------------------------------------------- 이력 */}
      <h3 className="mt-5 text-sm font-bold">
        {t("modals:consult.historyTitle")}{" "}
        <span className="text-muted">{t("modals:consult.historyCount", { count: rows.length })}</span>
      </h3>

      {isLoading ? (
        <p className="mt-3 text-sm text-muted">{t("common:states.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("modals:consult.noRecords")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <li key={row._id} className="card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="nums text-sm font-bold">{row.date}</span>
                  {row.method && (
                    <span className="chip bg-plane text-ink2">{domain.consultMethod(row.method)}</span>
                  )}
                  {row.categories.map((c) => (
                    <span key={c} className="chip bg-[#eef3fa] text-brand">
                      {domain.consultCategory(c)}
                    </span>
                  ))}
                </div>
                {!readOnly && (
                  <div className="flex gap-1">
                    <button className="btn px-2 py-1 text-xs" onClick={() => startEdit(row)}>
                      {t("common:actions.edit")}
                    </button>
                    <button
                      className="btn px-2 py-1 text-xs text-critical"
                      onClick={() => {
                        if (window.confirm(t("modals:consult.confirmDelete"))) remove.mutate(row._id);
                      }}
                    >
                      {t("common:actions.delete")}
                    </button>
                  </div>
                )}
              </div>

              {row.content && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{row.content}</p>
              )}
              {row.result && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink2">
                  <span className="font-semibold">{t("modals:consult.resultPrefix")}</span>
                  {row.result}
                </p>
              )}
              {row.counselor && (
                <p className="mt-1 text-xs text-muted">
                  {t("modals:consult.counselorLabel")} {row.counselor}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
