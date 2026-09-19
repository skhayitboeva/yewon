import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api";
import { tError } from "../i18n";
import { EMPTY_INFO, type Info as InfoData, type InfoItem, type Role } from "../../shared/domain";

type FixedFieldKey = Exclude<keyof InfoData, "items">;

const FIELD_KEYS: { key: FixedFieldKey; labelKey: string }[] = [
  { key: "tuitionDeadline", labelKey: "fields.tuitionDeadline" },
  { key: "classTimeUndergraduate", labelKey: "fields.classTimeUndergraduate" },
  { key: "classTimeGraduate", labelKey: "fields.classTimeGraduate" },
  { key: "visaApplicationTime", labelKey: "fields.visaApplicationTime" },
  { key: "orientation", labelKey: "fields.orientation" },
];

export function Info({
  role,
  onToast,
}: {
  role: Role | null;
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const { t } = useTranslation(["info", "common"]);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["info"], queryFn: api.info });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InfoData>(EMPTY_INFO);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const isAdmin = role === "admin";

  function startEdit() {
    setDraft(data ?? EMPTY_INFO);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(data ?? EMPTY_INFO);
    setEditing(false);
  }

  function addItem() {
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
    setDraft((prev) => ({ ...prev, items: [...prev.items, { id, label: "", value: "" }] }));
  }

  function updateItem(id: string, patch: Partial<InfoItem>) {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function removeItem(id: string) {
    setDraft((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));
  }

  async function save() {
    setBusy(true);
    try {
      await api.saveInfo(draft);
      await qc.invalidateQueries({ queryKey: ["info"] });
      onToast("ok", t("info:savedToast"));
      setEditing(false);
    } catch (err) {
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("저장에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-sm text-ink2">
        <span aria-hidden>⚠️</span>
        <p>{t("info:banner")}</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">{t("info:title")}</h2>
        {isAdmin && !editing && (
          <button className="btn" type="button" onClick={startEdit}>
            {t("common:actions.edit")}
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">{t("common:states.loading")}</p>
      ) : editing ? (
        <div className="space-y-3.5">
          {FIELD_KEYS.map(({ key, labelKey }) => (
            <div key={key} className="card p-4">
              <label className="label">{t(`info:${labelKey}`)}</label>
              <textarea
                className="field"
                rows={2}
                value={draft[key]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          {draft.items.map((item) => (
            <div key={item.id} className="card space-y-2 p-4">
              <div className="flex items-start gap-2">
                <input
                  className="field"
                  placeholder={t("info:itemTitlePlaceholder")}
                  value={item.label}
                  onChange={(e) => updateItem(item.id, { label: e.target.value })}
                />
                <button
                  className="btn btn-danger shrink-0"
                  type="button"
                  onClick={() => removeItem(item.id)}
                >
                  {t("common:actions.delete")}
                </button>
              </div>
              <textarea
                className="field"
                rows={2}
                value={item.value}
                onChange={(e) => updateItem(item.id, { value: e.target.value })}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button className="btn" type="button" onClick={addItem}>
              {t("info:addItem")}
            </button>
            <div className="flex gap-2">
              <button className="btn" type="button" onClick={cancelEdit} disabled={busy}>
                {t("common:actions.cancel")}
              </button>
              <button className="btn btn-primary" type="button" onClick={save} disabled={busy}>
                {busy ? "Loading…" : t("common:actions.save")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {FIELD_KEYS.map(({ key, labelKey }) => (
            <div key={key} className="card p-4">
              <div className="label">{t(`info:${labelKey}`)}</div>
              <div className="whitespace-pre-wrap text-sm text-ink">
                {data?.[key] ? data[key] : <span className="text-muted">{t("info:notSet")}</span>}
              </div>
            </div>
          ))}
          {data?.items.map((item) => (
            <div key={item.id} className="card p-4">
              <div className="label">
                {item.label || <span className="text-muted">{t("info:notSet")}</span>}
              </div>
              <div className="whitespace-pre-wrap text-sm text-ink">
                {item.value || <span className="text-muted">{t("info:notSet")}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
