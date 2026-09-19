import type { ToastMessage } from "../hooks";

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg px-3.5 py-2.5
            text-left text-sm font-medium text-white shadow-lg transition
            ${t.kind === "error" ? "bg-critical" : "bg-ink"}`}
        >
          <span aria-hidden className="mt-px font-bold">
            {t.kind === "error" ? "!" : "✓"}
          </span>
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  );
}
