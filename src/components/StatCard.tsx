import { formatKRW } from "../../shared/domain";

type Tone = "neutral" | "good" | "warning" | "serious" | "critical";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  good: "text-good",
  warning: "text-[#8a6100]", // warning hue at text contrast on the light surface
  serious: "text-[#a8481f]",
  critical: "text-critical",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-brand",
  good: "bg-good",
  warning: "bg-warning",
  serious: "bg-serious",
  critical: "bg-critical",
};

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  share,
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: Tone;
  /** 0–1; draws a thin share meter under the number. */
  share?: number;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {tone !== "neutral" && (
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
        )}
        <span className="text-[13px] font-semibold text-ink2">{label}</span>
      </div>

      <div className={`nums mt-2 text-[28px] font-extrabold leading-none ${TONE_TEXT[tone]}`}>
        {typeof value === "number" ? formatKRW(value) : value}
      </div>

      {share !== undefined && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#edf1f5]">
          <div
            className={`h-full rounded-full ${TONE_DOT[tone]}`}
            style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }}
          />
        </div>
      )}

      {sub && <div className="nums mt-2 text-xs text-muted">{sub}</div>}
    </>
  );

  if (!onClick) return <div className="card p-4">{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className="card p-4 text-left transition hover:border-rule hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
    >
      {body}
    </button>
  );
}
