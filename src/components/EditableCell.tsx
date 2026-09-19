import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Kind = "text" | "number" | "date" | "phone";
const PHONE_MAX_DIGITS = 11;

export function EditableCell({
  value,
  kind = "text",
  onSave,
  align = "left",
  placeholder = "—",
  width,
  readOnly = false,
}: {
  value: string | number;
  kind?: Kind;
  onSave: (next: string | number) => void;
  align?: "left" | "right";
  placeholder?: string;
  width?: number;
  readOnly?: boolean;
}) {
  const { t } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value ?? ""));
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const raw = draft.trim();
    if (kind === "number") {
      const next = Number(raw.replace(/,/g, "")) || 0;
      if (next !== Number(value)) onSave(next);
      return;
    }
    if (raw !== String(value ?? "")) onSave(raw);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={kind === "number" || kind === "phone" ? "text" : kind}
        inputMode={kind === "number" || kind === "phone" ? "numeric" : undefined}
        className="w-full rounded border border-brand bg-white px-1.5 py-1 text-sm outline-none ring-2 ring-brand/20"
        style={width ? { width } : undefined}
        value={draft}
        onChange={(e) =>
          setDraft(
            kind === "phone"
              ? e.target.value.replace(/[^\d]/g, "").slice(0, PHONE_MAX_DIGITS)
              : e.target.value
          )
        }
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(String(value ?? ""));
            setEditing(false);
          }
        }}
      />
    );
  }

  const display =
    kind === "number"
      ? new Intl.NumberFormat("ko-KR").format(Number(value) || 0)
      : String(value ?? "");

  if (readOnly) {
    return (
      <span
        className={`-mx-1 block w-full truncate px-1 py-0.5
          ${align === "right" ? "text-right" : "text-left"}
          ${display ? "" : "text-muted"}`}
      >
        {display || placeholder}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={t("states.clickToEdit")}
      className={`-mx-1 block w-full truncate rounded px-1 py-0.5 hover:bg-[#eef3fa]
        ${align === "right" ? "text-right" : "text-left"}
        ${display ? "" : "text-muted"}`}
    >
      {display || placeholder}
    </button>
  );
}

export function SelectCell({
  value,
  options,
  onSave,
  tone,
  renderLabel = (v) => v,
  readOnly = false,
}: {
  value: string;
  options: readonly string[];
  onSave: (next: string) => void;
  tone?: (value: string) => string;
  /** Translates a raw option value into its displayed label. */
  renderLabel?: (value: string) => string;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <span className={`-mx-1 block w-full px-1 py-0.5 text-sm ${tone ? tone(value) : ""}`}>
        {renderLabel(value) || "—"}
      </span>
    );
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value)}
      className={`-mx-1 w-full cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-sm
        outline-none hover:bg-[#eef3fa] focus:ring-2 focus:ring-brand/30 ${tone ? tone(value) : ""}`}
    >
      {!options.includes(value) && <option value={value}>{renderLabel(value) || "—"}</option>}
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {renderLabel(opt) || "—"}
        </option>
      ))}
    </select>
  );
}
