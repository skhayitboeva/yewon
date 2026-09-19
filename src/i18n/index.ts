import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import commonKo from "../locales/ko/common.json";
import loginKo from "../locales/ko/login.json";
import dashboardKo from "../locales/ko/dashboard.json";
import studentsKo from "../locales/ko/students.json";
import filtersKo from "../locales/ko/filters.json";
import modalsKo from "../locales/ko/modals.json";
import profileKo from "../locales/ko/profile.json";
import infoKo from "../locales/ko/info.json";
import notificationsKo from "../locales/ko/notifications.json";
import domainKo from "../locales/ko/domain.json";
import errorsKo from "../locales/ko/errors.json";

import commonEn from "../locales/en/common.json";
import loginEn from "../locales/en/login.json";
import dashboardEn from "../locales/en/dashboard.json";
import studentsEn from "../locales/en/students.json";
import filtersEn from "../locales/en/filters.json";
import modalsEn from "../locales/en/modals.json";
import profileEn from "../locales/en/profile.json";
import infoEn from "../locales/en/info.json";
import notificationsEn from "../locales/en/notifications.json";
import domainEn from "../locales/en/domain.json";
import errorsEn from "../locales/en/errors.json";

import commonUz from "../locales/uz/common.json";
import loginUz from "../locales/uz/login.json";
import dashboardUz from "../locales/uz/dashboard.json";
import studentsUz from "../locales/uz/students.json";
import filtersUz from "../locales/uz/filters.json";
import modalsUz from "../locales/uz/modals.json";
import profileUz from "../locales/uz/profile.json";
import infoUz from "../locales/uz/info.json";
import notificationsUz from "../locales/uz/notifications.json";
import domainUz from "../locales/uz/domain.json";
import errorsUz from "../locales/uz/errors.json";

export type Lang = "ko" | "en" | "uz";

export const SUPPORTED_LANGS: Lang[] = ["ko", "en", "uz"];
export const NAMESPACES = [
  "common",
  "login",
  "dashboard",
  "students",
  "filters",
  "modals",
  "profile",
  "info",
  "notifications",
  "domain",
  "errors",
] as const;

const STORAGE_KEY = "yewon_lang";

function readStored(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return (SUPPORTED_LANGS as string[]).includes(v ?? "") ? (v as Lang) : "ko";
  } catch {
    return "ko";
  }
}

void i18next.use(initReactI18next).init({
  resources: {
    ko: {
      common: commonKo,
      login: loginKo,
      dashboard: dashboardKo,
      students: studentsKo,
      filters: filtersKo,
      modals: modalsKo,
      profile: profileKo,
      info: infoKo,
      notifications: notificationsKo,
      domain: domainKo,
      errors: errorsKo,
    },
    en: {
      common: commonEn,
      login: loginEn,
      dashboard: dashboardEn,
      students: studentsEn,
      filters: filtersEn,
      modals: modalsEn,
      profile: profileEn,
      info: infoEn,
      notifications: notificationsEn,
      domain: domainEn,
      errors: errorsEn,
    },
    uz: {
      common: commonUz,
      login: loginUz,
      dashboard: dashboardUz,
      students: studentsUz,
      filters: filtersUz,
      modals: modalsUz,
      profile: profileUz,
      info: infoUz,
      notifications: notificationsUz,
      domain: domainUz,
      errors: errorsUz,
    },
  },
  lng: readStored(),
  fallbackLng: "ko",
  supportedLngs: SUPPORTED_LANGS,
  defaultNS: "common",
  ns: NAMESPACES as unknown as string[],
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18next.on("languageChanged", (next) => {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private-mode storage may throw */
  }
});

/** Server error strings and their client-side fallbacks are keyed by the
 * exact Korean text (see src/locales/*\/errors.json) rather than a semantic
 * key, since that Korean text is the API's actual response contract. Always
 * go through this helper instead of calling t() directly on such a string,
 * since it disables key/namespace-separator parsing (the Korean sentences
 * contain "." and other characters i18next would otherwise treat specially)
 * and falls back to the raw text for anything not yet in the catalog. */
export function tError(message: string, options?: Record<string, unknown>): string {
  return i18next.t(message, {
    ...options,
    ns: "errors",
    keySeparator: false,
    nsSeparator: false,
    defaultValue: message,
  });
}

export default i18next;
