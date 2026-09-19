import { useState } from "react";
import {
  TUITION_STATUSES,
  formatKRW,
  tuitionPaid,
  type Tuition,
  type TuitionStatus,
} from "../../shared/domain";

const STATUS_CHIP: Record<string, string> = {
  완납: "bg-[#e8f7e8] text-[#0a7d0a]",
  부분납부: "bg-[#fdf3dd] text-[#8a6100]",
  미납: "bg-[#fbeaea] text-critical",
};

const TERMS = [1, 2, 3, 4] as const;

export function TuitionCell({
  tuition,
  onSave,
}: {
  tuition: Tuition;
  onSave: (patch: Partial<Tuition>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Tuition>(tuition);

  const paid = tuitionPaid(tuition);
  const mismatch = draft.total > 0 && tuitionPaid(draft) !== draft.total;

  function start() {
    setDraft(tuition);
    setOpen(true);
  }

  function save() {
    const patch: Partial<Tuition> = {};
    (Object.keys(draft) as (keyof Tuition)[]).forEach((key) => {
      if (draft[key] !== tuition[key]) (patch as any)[key] = draft[key];
    });
    if (Object.keys(patch).length) onSave(patch);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={start}
        title="클릭하여 수정"
        className="-mx-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-[#eef3fa]"
      >
        <span className={`chip shrink-0 ${STATUS_CHIP[tuition?.status] ?? "bg-plane text-ink2"}`}>
          {tuition?.status ?? "미납"}
        </span>
        <span className="nums truncate text-xs text-ink2">
          {formatKRW(paid)} / {formatKRW(tuition?.total)}
        </span>
      </button>
    );
  }

  return (
    <div className="absolute right-2 z-20 mt-1 w-64 rounded-xl border border-line bg-surface p-3 shadow-xl">
      <label className="label">상태</label>
      <select
        className="field"
        value={draft.status}
        onChange={(e) => setDraft({ ...draft, status: e.target.value as TuitionStatus })}
      >
        {TUITION_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>

      <label className="label mt-2.5">총액 (원)</label>
      <input
        className="field nums text-right"
        inputMode="numeric"
        value={draft.total ? formatKRW(draft.total) : ""}
        onChange={(e) =>
          setDraft({ ...draft, total: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })
        }
      />

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {TERMS.map((n) => {
          const key = `term${n}` as const;
          return (
            <div key={n}>
              <label className="label">{n}차</label>
              <input
                className="field nums text-right"
                inputMode="numeric"
                value={draft[key] ? formatKRW(draft[key]) : ""}
                onChange={(e) =>
                  setDraft({ ...draft, [key]: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })
                }
              />
            </div>
          );
        })}
      </div>

      <label className="label mt-2.5">비고</label>
      <input
        className="field"
        value={draft.note ?? ""}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
      />

      <p className="nums mt-2 text-xs text-muted">
        납부 합계 {formatKRW(tuitionPaid(draft))}원
        {mismatch && (
          <span className="ml-1 font-semibold text-[#8a6100]">
            · 총액과 {formatKRW(Math.abs(draft.total - tuitionPaid(draft)))}원 차이
          </span>
        )}
      </p>

      <div className="mt-3 flex justify-end gap-2">
        <button className="btn" onClick={() => setOpen(false)}>
          취소
        </button>
        <button className="btn btn-primary" onClick={save}>
          저장
        </button>
      </div>
    </div>
  );
}
