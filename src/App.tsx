import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { Login } from "./components/Login";
import { Dashboard, type DrillFilter } from "./components/Dashboard";
import { StudentsTable } from "./components/StudentsTable";
import { Info } from "./components/Info";
import { MyDetails } from "./components/MyDetails";
import { Profile } from "./components/Profile";
import { Toasts } from "./components/Toast";
import { useToasts } from "./hooks";
import { useLang } from "./i18n";
import type { Role } from "../shared/domain";

type Tab = "dashboard" | "students" | "details" | "profile" | "info";

const TABS_BY_ROLE: Record<Role, { tabs: Tab[]; default: Tab }> = {
  admin: { tabs: ["dashboard", "students", "info", "profile"], default: "dashboard" },
  manager: { tabs: ["dashboard", "students", "info", "profile"], default: "dashboard" },
  user: { tabs: ["details", "profile", "info"], default: "details" },
};

const TAB_LABELS: Record<Tab, string> = {
  dashboard: "대시보드",
  students: "전체 학생",
  details: "내 정보",
  profile: "프로필",
  info: "안내",
};

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [drill, setDrill] = useState<DrillFilter | undefined>(undefined);
  const [tableKey, setTableKey] = useState(0);
  const { toasts, push, dismiss } = useToasts();
  const qc = useQueryClient();
  const { lang, t, toggle } = useLang();

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
    refreshAuth();
  }, []);

  if (authed === null) {
    return <p className="p-10 text-center text-sm text-muted">{t("확인 중…")}</p>;
  }

  if (!authed) {
    return <Login onSuccess={refreshAuth} />;
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
    await api.logout().catch(() => {});
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
            <h1 className="text-lg font-bold">{t("예원예술대학교 유학생 관리 시스템")} (Uzbekistan)</h1>
            <p className="mt-0.5 text-xs text-white/70">
              {t("학부 · 대학원 | 학적 · 등록금 · 출결 · 상담 통합 관리")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={toggle}
              title={lang === "ko" ? "Switch to English" : "한국어로 전환"}
              className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
            >
              {lang === "ko" ? "EN" : "한국어"}
            </button>
            <button
              onClick={logout}
              className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
            >
              {t("로그아웃")}
            </button>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] gap-1.5">
          {roleTabs?.tabs.map((tb) => (
            <button key={tb} className={tabClass(tb)} onClick={() => setTab(tb)}>
              {t(TAB_LABELS[tb])}
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
      </main>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
