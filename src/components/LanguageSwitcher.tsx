import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, type Lang } from "../i18n";

const SELF_LABEL: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
  uz: "O'zbekcha",
};

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = (i18n.language in SELF_LABEL ? i18n.language : "ko") as Lang;

  return (
    <select
      aria-label="Language"
      value={current}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className={`rounded-lg px-2 py-1.5 text-sm font-semibold ${className}`}
    >
      {SUPPORTED_LANGS.map((l) => (
        <option key={l} value={l} className="text-ink">
          {SELF_LABEL[l]}
        </option>
      ))}
    </select>
  );
}
