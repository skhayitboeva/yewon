import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useLang } from "../i18n";

const MIN_PASSWORD_LENGTH = 5;
const MOBILE_MAX_DIGITS = 11;

type Mode = "staff" | "student";
type StudentStep = "phone" | "password";

/** When set, we're running inside the Telegram Mini App: there is no staff
 * mode, and a successful password step binds this Telegram account to the
 * matched student instead of just starting a normal session. */
export interface TelegramLinkProps {
  initData: string;
  onLinked: (token: string) => void;
}

export function Login({
  onSuccess,
  telegram,
}: {
  onSuccess: () => void;
  telegram?: TelegramLinkProps;
}) {
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

        {telegram ? (
          <>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              {t("처음 사용하시면 학교에 등록된 휴대전화 번호로 본인 확인이 필요합니다.")}
            </p>
            <StudentLoginForm onSuccess={onSuccess} telegram={telegram} />
          </>
        ) : mode === "staff" ? (
          <StaffLoginForm onSuccess={onSuccess} />
        ) : (
          <StudentLoginForm onSuccess={onSuccess} />
        )}

        {!telegram && (
          <button
            type="button"
            className="mt-4 w-full text-center text-xs font-semibold text-brand hover:underline"
            onClick={() => switchMode(mode === "staff" ? "student" : "staff")}
          >
            {mode === "staff"
              ? t("학생이신가요? 휴대전화 번호로 로그인")
              : t("직원이신가요? 아이디로 로그인")}
          </button>
        )}

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

function StudentLoginForm({
  onSuccess,
  telegram,
}: {
  onSuccess: () => void;
  telegram?: TelegramLinkProps;
}) {
  const [step, setStep] = useState<StudentStep>("phone");
  const [mobile, setMobile] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const { t } = useLang();

  if (requesting) {
    return <AccessRequestForm initialMobile={mobile} onBack={() => setRequesting(false)} />;
  }

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
      if (telegram) {
        const { token } = await api.telegramLink(telegram.initData, mobile, password);
        telegram.onLinked(token);
      } else {
        await api.studentLogin(mobile, password);
        onSuccess();
      }
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

        <button
          type="button"
          className="mt-3 w-full text-center text-xs font-semibold text-brand hover:underline"
          onClick={() => setRequesting(true)}
        >
          {t("번호를 찾을 수 없으신가요? 접속 요청하기")}
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

/** For a student whose phone isn't on file yet — collects the three fields
 * (all 100% populated in the real data, unlike phone) an admin needs to find
 * and confirm the right record, then queues it for approval. */
function AccessRequestForm({ initialMobile, onBack }: { initialMobile: string; onBack: () => void }) {
  const [nameKo, setNameKo] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [mobile, setMobile] = useState(initialMobile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const { t } = useLang();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.submitAccessRequest({ nameKo, birthDate, mobile });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6">
        <p className="text-sm text-ink2">
          {t("요청이 접수되었습니다. 관리자 확인 후 로그인할 수 있습니다.")}
        </p>
        <button
          type="button"
          className="mt-4 w-full text-center text-xs font-semibold text-ink2 hover:underline"
          onClick={onBack}
        >
          {t("뒤로")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <p className="text-xs leading-relaxed text-muted">
        {t("등록된 번호를 찾지 못했을 때 이름과 생년월일로 관리자에게 연결을 요청할 수 있습니다.")}
      </p>

      <label className="label mt-3" htmlFor="req-name">
        {t("성명")}
      </label>
      <input id="req-name" autoFocus className="field" value={nameKo} onChange={(e) => setNameKo(e.target.value)} />

      <label className="label mt-3" htmlFor="req-birth">
        {t("생년월일")}
      </label>
      <input
        id="req-birth"
        type="date"
        className="field"
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
      />

      <label className="label mt-3" htmlFor="req-mobile">
        {t("휴대전화 번호")}
      </label>
      <input
        id="req-mobile"
        type="tel"
        inputMode="numeric"
        className="field"
        value={mobile}
        onChange={(e) => setMobile(e.target.value.replace(/[^\d]/g, "").slice(0, MOBILE_MAX_DIGITS))}
      />

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-critical">
          {t(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !nameKo || !birthDate || !mobile}
        className="btn btn-primary mt-5 w-full py-2"
      >
        {busy ? t("확인 중…") : t("요청 보내기")}
      </button>

      <button type="button" className="mt-3 w-full text-center text-xs font-semibold text-ink2 hover:underline" onClick={onBack}>
        {t("뒤로")}
      </button>
    </form>
  );
}
