import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { Login } from "./components/Login";
import { Dashboard, type DrillFilter } from "./components/Dashboard";
import { StudentsTable } from "./components/StudentsTable";
import { Toasts } from "./components/Toast";
import { useToasts } from "./hooks";

type Tab = "dashboard" | "students";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [drill, setDrill] = useState<DrillFilter | undefined>(undefined);
  const [tableKey, setTableKey] = useState(0);
  const { toasts, push, dismiss } = useToasts();
  const qc = useQueryClient();

  useEffect(() => {
    api
      .me()
      .then((r) => setAuthed(r.authed))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return <p className="p-10 text-center text-sm text-muted">확인 중…</p>;
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

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
  }

  const tabClass = (t: Tab) =>
    `rounded-lg px-3.5 py-2 text-sm font-bold transition ${
      tab === t ? "bg-brand text-white" : "text-ink2 hover:bg-plane"
    }`;

  return (
    <div className="min-h-full">
      <header className="bg-[#243b53] px-5 py-4 text-white sm:px-7">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold">예원예술대학교 유학생 관리 시스템</h1>
            <p className="mt-0.5 text-xs text-white/70">
              학부 · 대학원 | 학적 · 등록금 · 출결 · 상담 통합 관리
            </p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
          >
            로그아웃
          </button>
        </div>
      </header>

      <nav className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] gap-1.5">
          <button className={tabClass("dashboard")} onClick={() => setTab("dashboard")}>
            대시보드
          </button>
          <button className={tabClass("students")} onClick={() => setTab("students")}>
            전체 학생
          </button>
        </div>
      </nav>

      <main>
        {tab === "dashboard" ? (
          <Dashboard onDrill={openStudents} />
        ) : (
          <StudentsTable key={tableKey} onToast={push} initialFilter={drill} />
        )}
      </main>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
