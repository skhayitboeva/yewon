import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api";
import { tError } from "../i18n";
import { useDomainLabel } from "../i18n/domainLabels";
import { ENROLL_STATUSES, LEVELS } from "../../shared/domain";

export function Notifications({
  onToast,
}: {
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  return (
    <div className="mx-auto max-w-[900px] space-y-4 p-4 sm:p-6">
      <AccessRequestQueue onToast={onToast} />
      <BroadcastComposer onToast={onToast} />
    </div>
  );
}

function AccessRequestQueue({
  onToast,
}: {
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const { t } = useTranslation(["notifications", "common"]);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["accessRequests"], queryFn: api.accessRequests });
  const [selected, setSelected] = useState<Record<string, string>>({});

  async function approve(id: string) {
    const targetId = selected[id];
    if (!targetId) {
      onToast("error", t("notifications:accessRequests.selectStudentRequired"));
      return;
    }
    try {
      await api.resolveAccessRequest(id, { action: "approve", targetId });
      onToast("ok", t("notifications:accessRequests.approvedToast"));
      qc.invalidateQueries({ queryKey: ["accessRequests"] });
      qc.invalidateQueries({ queryKey: ["students"] });
    } catch (err) {
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("처리에 실패했습니다."));
    }
  }

  async function reject(id: string) {
    try {
      await api.resolveAccessRequest(id, { action: "reject" });
      onToast("ok", t("notifications:accessRequests.rejectedToast"));
      qc.invalidateQueries({ queryKey: ["accessRequests"] });
    } catch (err) {
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("처리에 실패했습니다."));
    }
  }

  const requests = data?.requests ?? [];

  return (
    <div className="card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
        {t("notifications:accessRequests.title")}
        {requests.length > 0 && (
          <span className="nums rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
            {requests.length}
          </span>
        )}
      </h3>
      {isLoading ? (
        <p className="text-sm text-muted">{t("common:states.loading")}</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted">{t("notifications:accessRequests.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r._id} className="card bg-plane p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold">{r.nameKo}</span>
                <span className="text-ink2">{r.birthDate}</span>
                <span className="nums text-ink2">{r.mobile}</span>
              </div>

              {r.candidates.length === 0 ? (
                <p className="mt-2 text-xs text-critical">{t("notifications:accessRequests.noMatch")}</p>
              ) : (
                <select
                  className="field mt-2"
                  value={selected[r._id] ?? ""}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [r._id]: e.target.value }))}
                >
                  <option value="">{t("notifications:accessRequests.selectStudent")}</option>
                  {r.candidates.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.studentId} · {c.nameKo} ({c.mobile || t("notifications:accessRequests.noPhone")})
                    </option>
                  ))}
                </select>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <button className="btn px-2 py-1 text-xs" onClick={() => reject(r._id)}>
                  {t("notifications:accessRequests.rejectButton")}
                </button>
                <button
                  className="btn btn-primary px-2 py-1 text-xs"
                  disabled={r.candidates.length === 0}
                  onClick={() => approve(r._id)}
                >
                  {t("notifications:accessRequests.approveButton")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BroadcastComposer({
  onToast,
}: {
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const { t } = useTranslation(["notifications", "common"]);
  const domain = useDomainLabel();
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState("");
  const [enrollStatus, setEnrollStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; failed: number } | null>(null);

  async function send() {
    const text = message.trim();
    if (!text) {
      onToast("error", t("notifications:broadcast.messageRequired"));
      return;
    }

    setBusy(true);
    setProgress({ sent: 0, failed: 0 });
    const filters: Record<string, string> = {};
    if (level) filters.level = level;
    if (enrollStatus) filters.enrollStatus = enrollStatus;

    let cursor: string | undefined;
    let totalSent = 0;
    let totalFailed = 0;
    try {
      do {
        const r = await api.broadcast({ message: text, filters, cursor });
        totalSent += r.sent;
        totalFailed += r.failed;
        setProgress({ sent: totalSent, failed: totalFailed });
        cursor = r.nextCursor ?? undefined;
      } while (cursor);
      onToast("ok", t("notifications:broadcast.completedToast"));
      setMessage("");
    } catch (err) {
      onToast("error", err instanceof ApiError ? tError(err.message) : tError("발송에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold">{t("notifications:broadcast.title")}</h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">{t("notifications:broadcast.levelLabel")}</label>
          <select className="field" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">{t("common:filters.all")}</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {domain.level(l)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("notifications:broadcast.enrollStatusLabel")}</label>
          <select className="field" value={enrollStatus} onChange={(e) => setEnrollStatus(e.target.value)}>
            <option value="">{t("common:filters.all")}</option>
            {ENROLL_STATUSES.filter((s) => s !== "삭제").map((s) => (
              <option key={s} value={s}>
                {domain.enrollStatus(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="label mt-3">{t("notifications:broadcast.messageLabel")}</label>
      <textarea
        className="field min-h-[96px]"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      {progress && (
        <p className="mt-2 text-xs text-muted">
          {t("notifications:broadcast.sentCount")} {progress.sent} · {t("notifications:broadcast.failedCount")}{" "}
          {progress.failed}
        </p>
      )}

      <button className="btn btn-primary mt-3" onClick={send} disabled={busy}>
        {busy ? "Loading…" : t("notifications:broadcast.sendButton")}
      </button>
      <p className="mt-2 text-xs text-muted">{t("notifications:broadcast.telegramOnlyNote")}</p>
    </div>
  );
}
