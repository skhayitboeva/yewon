import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useLang } from "../i18n";

const MIN_PASSWORD_LENGTH = 5;
const MOBILE_MAX_DIGITS = 11;

type Mode = "staff" | "student";
type StudentStep = "phone" | "password";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<Mode>("staff");
  const { t } = useLang();

  function switchMode(next: Mode) {
    setMode(next);
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6 shadow-sm">
        <h1 className="text-lg font-bold">{t("예원예술대학교")}</h1>
        <p className="mt-1 text-sm text-muted">{t("유학생 관리 시스템")}</p>

        {mode === "staff" ? <StaffLoginForm onSuccess={onSuccess} /> : <StudentLoginForm onSuccess={onSuccess} />}

        <button
          type="button"
          className="mt-4 w-full text-center text-xs font-semibold text-brand hover:underline"
          onClick={() => switchMode(mode === "staff" ? "student" : "staff")}
        >
          {mode === "staff"
            ? t("학생이신가요? 휴대전화 번호로 로그인")
            : t("직원이신가요? 아이디로 로그인")}
        </button>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          {t("학생 개인정보가 포함된 시스템입니다. 비밀번호를 외부에 공유하지 마세요.")}
        </p>
      </div>
    </div>
  );
}

function StaffLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useLang();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(username, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "로그인에 실패했습니다.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <label className="label" htmlFor="username">
        {t("아이디")}
      </label>
      <input
        id="username"
        type="text"
        autoFocus
        autoComplete="username"
        className="field"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <label className="label mt-3" htmlFor="password">
        {t("비밀번호")}
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        className="field"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-critical">
          {t(error)}
        </p>
      )}

      <button type="submit" disabled={busy || !username || !password} className="btn btn-primary mt-5 w-full py-2">
        {busy ? t("확인 중…") : t("로그인")}
      </button>
    </form>
  );
}

function StudentLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<StudentStep>("phone");
  const [mobile, setMobile] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useLang();

  async function submitPhone(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.studentLogin(mobile);
      setNeedsPassword(Boolean(r.needsPassword));
      setStep("password");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.studentLogin(mobile, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "로그인에 실패했습니다.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setStep("phone");
    setPassword("");
    setError("");
  }

  if (step === "phone") {
    return (
      <form onSubmit={submitPhone} className="mt-6">
        <label className="label" htmlFor="mobile">
          {t("휴대전화 번호")}
        </label>
        <input
          id="mobile"
          type="tel"
          inputMode="numeric"
          autoFocus
          autoComplete="tel"
          className="field"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/[^\d]/g, "").slice(0, MOBILE_MAX_DIGITS))}
        />

        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-critical">
            {t(error)}
          </p>
        )}

        <button type="submit" disabled={busy || !mobile} className="btn btn-primary mt-5 w-full py-2">
          {busy ? t("확인 중…") : t("확인")}
        </button>
      </form>
    );
  }

  const passwordTooShort = needsPassword && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  return (
    <form onSubmit={submitPassword} className="mt-6">
      <label className="label">{t("휴대전화 번호")}</label>
      <p className="field bg-plane text-muted">{mobile}</p>

      <label className="label mt-3" htmlFor="student-password">
        {needsPassword ? t("비밀번호 만들기") : t("비밀번호")}
      </label>
      <input
        id="student-password"
        type="password"
        autoFocus
        autoComplete={needsPassword ? "new-password" : "current-password"}
        className="field"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {needsPassword && (
        <p className={`mt-1 text-xs ${passwordTooShort ? "text-critical" : "text-muted"}`}>
          {t("비밀번호는 5자 이상이어야 합니다.")}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-critical">
          {t(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !password || (needsPassword && password.length < MIN_PASSWORD_LENGTH)}
        className="btn btn-primary mt-5 w-full py-2"
      >
        {busy ? t("확인 중…") : needsPassword ? t("가입 완료") : t("로그인")}
      </button>

      <button type="button" className="mt-3 w-full text-center text-xs font-semibold text-ink2 hover:underline" onClick={goBack}>
        {t("뒤로")}
      </button>
    </form>
  );
}
