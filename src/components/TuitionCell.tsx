import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TUITION_STATUSES,
  formatKRW,
  tuitionPaid,
  type Tuition,
  type TuitionStatus,
} from "../../shared/domain";
import { useDomainLabel } from "../i18n/domainLabels";

const STATUS_CHIP: Record<string, string> = {
  완납: "bg-[#e8f7e8] text-[#0a7d0a]",
  부분납부: "bg-[#fdf3dd] text-[#8a6100]",
  미납: "bg-[#fbeaea] text-critical",
};

const TERMS = [1, 2, 3, 4] as const;
/** Caps amount fields at 7 digits (max 9,999,999) — also keeps input well
 * inside Number's safe integer range, so pasting a long digit string can't
 * silently overflow into a garbled float when reformatted. */
const MAX_AMOUNT_DIGITS = 7;

function parseAmount(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "").slice(0, MAX_AMOUNT_DIGITS);
  return Number(digits) || 0;
}

/** Suggests a status from the entered amounts: nothing paid → 미납, less
 * than the total → 부분납부, at or above a known total → 완납. */
function suggestStatus(total: number, paidSum: number): TuitionStatus {
  if (paidSum <= 0) return "미납";
  if (total > 0 && paidSum >= total) return "완납";
  return "부분납부";
}

export function TuitionCell({
  tuition,
  onSave,
  readOnly = false,
}: {
  tuition: Tuition;
  onSave: (patch: Partial<Tuition>) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation(["modals", "common"]);
  const domain = useDomainLabel();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Tuition>(tuition);
  /** Once staff manually pick a status, stop auto-suggesting it for the rest of this edit. */
  const [statusOverridden, setStatusOverridden] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const paid = tuitionPaid(tuition);
  const draftPaid = tuitionPaid(draft);
  const overTotal = draft.total > 0 && draftPaid > draft.total;
  const underTotal = draft.total > 0 && draftPaid < draft.total;

  function start() {
    setDraft(tuition);
    setStatusOverridden(false);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  /** Updates an amount field and, unless status was manually overridden, re-suggests the status. */
  function setAmount(patch: Partial<Tuition>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (statusOverridden) return next;
      return { ...next, status: suggestStatus(next.total, tuitionPaid(next)) };
    });
  }

  function save() {
    if (overTotal) return;
    const patch: Partial<Tuition> = {};
    (Object.keys(draft) as (keyof Tuition)[]).forEach((key) => {
      if (draft[key] !== tuition[key]) (patch as any)[key] = draft[key];
    });
    if (Object.keys(patch).length) onSave(patch);
    setOpen(false);
  }

  const closedBody = (
    <>
      <span className={`chip shrink-0 ${STATUS_CHIP[tuition?.status] ?? "bg-plane text-ink2"}`}>
        {domain.tuitionStatus(tuition?.status ?? "미납")}
      </span>
      <span className="nums truncate text-xs text-ink2">
        {formatKRW(paid)} / {formatKRW(tuition?.total)}
      </span>
    </>
  );

  if (readOnly) {
    return (
      <div className="-mx-1 flex w-full items-center gap-1.5 px-1 py-0.5 text-left">
        {closedBody}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={start}
        title={t("common:states.clickToEdit")}
        className="-mx-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-[#eef3fa]"
      >
        {closedBody}
      </button>
    );
  }

  return (
    <div
      ref={popupRef}
      className="absolute right-2 z-20 mt-1 w-64 rounded-xl border border-line bg-surface p-3 shadow-xl"
    >
      <label className="label flex items-center justify-between">
        <span>{t("modals:tuition.statusLabel")}</span>
        {!statusOverridden && (
          <span className="text-[10px] font-normal text-muted">{t("modals:tuition.autoBadge")}</span>
        )}
      </label>
      <select
        className="field"
        value={draft.status}
        onChange={(e) => {
          setStatusOverridden(true);
          setDraft({ ...draft, status: e.target.value as TuitionStatus });
        }}
      >
        {TUITION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {domain.tuitionStatus(s)}
          </option>
        ))}
      </select>

      <label className="label mt-2.5">{t("modals:tuition.totalLabel")}</label>
      <input
        className="field nums text-right"
        inputMode="numeric"
        value={draft.total ? formatKRW(draft.total) : ""}
        onChange={(e) => setAmount({ total: parseAmount(e.target.value) })}
      />

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {TERMS.map((n) => {
          const key = `term${n}` as const;
          return (
            <div key={n}>
              <label className="label">{t("modals:tuition.termLabel", { n })}</label>
              <input
                className={`field nums text-right ${overTotal ? "!border-critical" : ""}`}
                inputMode="numeric"
                value={draft[key] ? formatKRW(draft[key]) : ""}
                onChange={(e) => setAmount({ [key]: parseAmount(e.target.value) })}
              />
            </div>
          );
        })}
      </div>

      <label className="label mt-2.5">{t("modals:tuition.noteLabel")}</label>
      <input
        className="field"
        value={draft.note ?? ""}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
      />

      <p className="nums mt-2 text-xs text-muted">
        {t("modals:tuition.totalPaid", { amount: formatKRW(draftPaid) })}
        {underTotal && (
          <span className="ml-1 font-semibold text-[#8a6100]">
            {t("modals:tuition.shortOfTotal", { amount: formatKRW(draft.total - draftPaid) })}
          </span>
        )}
      </p>
      {overTotal && (
        <p role="alert" className="mt-1 text-xs font-semibold text-critical">
          {t("modals:tuition.overTotal", { amount: formatKRW(draftPaid - draft.total) })}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button className="btn" onClick={() => setOpen(false)}>
          {t("common:actions.cancel")}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={overTotal}>
          {t("common:actions.save")}
        </button>
      </div>
    </div>
  );
}
