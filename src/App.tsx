import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setBearerToken } from "./api";
import { Login } from "./components/Login";
import { getInitData, isTelegram, prepareTelegramViewport } from "./telegram";
import { Dashboard, type DrillFilter } from "./components/Dashboard";
import { StudentsTable } from "./components/StudentsTable";
import { Info } from "./components/Info";
import { MyDetails } from "./components/MyDetails";
import { Profile } from "./components/Profile";
import { Notifications } from "./components/Notifications";
import { Toasts } from "./components/Toast";
import { useToasts } from "./hooks";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import type { Role } from "../shared/domain";

type Tab = "dashboard" | "students" | "details" | "profile" | "info" | "notifications";

const TABS_BY_ROLE: Record<Role, { tabs: Tab[]; default: Tab }> = {
  admin: { tabs: ["dashboard", "students", "info", "notifications", "profile"], default: "dashboard" },
  manager: { tabs: ["dashboard", "students", "info", "profile"], default: "dashboard" },
  user: { tabs: ["details", "profile", "info"], default: "details" },
};

const TAB_KEYS: Record<Tab, string> = {
  dashboard: "tabs.dashboard",
  students: "tabs.students",
  details: "tabs.details",
  profile: "tabs.profile",
  info: "tabs.info",
  notifications: "tabs.notifications",
};

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [drill, setDrill] = useState<DrillFilter | undefined>(undefined);
  const [tableKey, setTableKey] = useState(0);
  const { toasts, push, dismiss } = useToasts();
  const qc = useQueryClient();
  const { t } = useTranslation("common");

  async function refreshAuth() {
    try {
      const r = await api.me();
      setAuthed(r.authed);
      setRole(r.role);
    } catch {
      setAuthed(false);
      setRole(null);
    }
  }

  useEffect(() => {
    async function bootstrap() {
      // Telegram's WebView/iframe don't reliably carry cookies, so a Telegram
      // session lives in a bearer token instead — see src/api.ts. If this
      // Telegram account was linked before, this resolves it with no phone
      // or password; otherwise api.me() below just reports "not authed" and
      // Login renders the link flow (Telegram is never a plain login form).
      if (isTelegram()) {
        prepareTelegramViewport();
        try {
          const r = await api.telegramAuth(getInitData());
          if (r.linked && r.token) setBearerToken(r.token);
        } catch {
          /* fall through — Login will show the link flow */
        }
      }
      await refreshAuth();
    }
    bootstrap();
  }, []);

  if (authed === null) {
    return <p className="p-10 text-center text-sm text-muted">{t("states.loading")}</p>;
  }

  if (!authed) {
    return (
      <Login
        onSuccess={refreshAuth}
        telegram={
          isTelegram()
            ? {
                initData: getInitData(),
                onLinked: (token) => {
                  setBearerToken(token);
                  refreshAuth();
                },
              }
            : undefined
        }
      />
    );
  }

  const roleTabs = role ? TABS_BY_ROLE[role] : null;
  const effectiveTab: Tab =
    roleTabs && roleTabs.tabs.includes(tab) ? tab : (roleTabs?.default ?? "dashboard");

  function openStudents(filter: DrillFilter) {
    const params = new URLSearchParams(filter as Record<string, string>);
    window.history.replaceState(
      null,
      "",
      params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
    );
    setDrill(filter);
    setTableKey((k) => k + 1); // remount so the table picks up the new URL state
    setTab("students");
  }

  async function logout() {
    if (isTelegram()) {
      // No cookie to clear here — just drop the bearer token this tab holds.
      setBearerToken(null);
    } else {
      await api.logout().catch(() => {});
    }
    qc.clear();
    setAuthed(false);
    setRole(null);
  }

  const tabClass = (t: Tab) =>
    `rounded-lg px-3.5 py-2 text-sm font-bold transition ${
      effectiveTab === t ? "bg-brand text-white" : "text-ink2 hover:bg-plane"
    }`;

  return (
    <div className="min-h-full">
      <header className="bg-[#243b53] px-5 py-4 text-white sm:px-7">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold">{t("header.title")} (Uzbekistan)</h1>
            <p className="mt-0.5 text-xs text-white/70">{t("header.subtitle")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher className="border border-white/30 bg-transparent text-white hover:bg-white/10" />
            <button
              onClick={logout}
              className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
            >
              {t("header.logout")}
            </button>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] gap-1.5">
          {roleTabs?.tabs.map((tb) => (
            <button key={tb} className={tabClass(tb)} onClick={() => setTab(tb)}>
              {t(TAB_KEYS[tb])}
            </button>
          ))}
        </div>
      </nav>

      <main>
        {effectiveTab === "dashboard" && <Dashboard onDrill={openStudents} />}
        {effectiveTab === "students" && (
          <StudentsTable key={tableKey} onToast={push} initialFilter={drill} role={role!} />
        )}
        {effectiveTab === "details" && <MyDetails onToast={push} />}
        {effectiveTab === "profile" && <Profile role={role!} onToast={push} />}
        {effectiveTab === "info" && <Info role={role} onToast={push} />}
        {effectiveTab === "notifications" && <Notifications onToast={push} />}
      </main>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
