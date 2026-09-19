import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useLang } from "../i18n";
import { EMPTY_INFO, type Info as InfoData, type InfoItem, type Role } from "../../shared/domain";

type FixedFieldKey = Exclude<keyof InfoData, "items">;

const FIELDS: { key: FixedFieldKey; label: string }[] = [
  { key: "tuitionDeadline", label: "등록금 마감 기한" },
  { key: "classTimeUndergraduate", label: "학부 수업 요일 및 시간" },
  { key: "classTimeGraduate", label: "대학원 수업 요일 및 시간" },
  { key: "visaApplicationTime", label: "비자 신청 시간" },
  { key: "orientation", label: "오리엔테이션" },
];

export function Info({
  role,
  onToast,
}: {
  role: Role | null;
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const { t } = useLang();
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
      onToast("ok", t("안내 정보를 저장했습니다."));
      setEditing(false);
    } catch (err) {
      onToast("error", err instanceof ApiError ? t(err.message) : t("저장에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-sm text-ink2">
        <span aria-hidden>⚠️</span>
        <p>
          {t("이 정보는 관리자만 입력·수정할 수 있으며, 그 외 사용자는 조회만 가능합니다.")}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">{t("안내")}</h2>
        {isAdmin && !editing && (
          <button className="btn" type="button" onClick={startEdit}>
            {t("수정")}
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">{t("불러오는 중…")}</p>
      ) : editing ? (
        <div className="space-y-3.5">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="card p-4">
              <label className="label">{t(label)}</label>
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
                  placeholder={t("제목")}
                  value={item.label}
                  onChange={(e) => updateItem(item.id, { label: e.target.value })}
                />
                <button
                  className="btn btn-danger shrink-0"
                  type="button"
                  onClick={() => removeItem(item.id)}
                >
                  {t("삭제")}
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
              {t("새 항목 추가")}
            </button>
            <div className="flex gap-2">
              <button className="btn" type="button" onClick={cancelEdit} disabled={busy}>
                {t("취소")}
              </button>
              <button className="btn btn-primary" type="button" onClick={save} disabled={busy}>
                {busy ? t("저장 중…") : t("저장")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="card p-4">
              <div className="label">{t(label)}</div>
              <div className="whitespace-pre-wrap text-sm text-ink">
                {data?.[key] ? data[key] : <span className="text-muted">{t("미입력")}</span>}
              </div>
            </div>
          ))}
          {data?.items.map((item) => (
            <div key={item.id} className="card p-4">
              <div className="label">
                {item.label || <span className="text-muted">{t("미입력")}</span>}
              </div>
              <div className="whitespace-pre-wrap text-sm text-ink">
                {item.value || <span className="text-muted">{t("미입력")}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
