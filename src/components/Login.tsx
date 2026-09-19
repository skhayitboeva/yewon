import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api";
import { tError } from "../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

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
  const { t } = useTranslation("login");

  function switchMode(next: Mode) {
    setMode(next);
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">{t("brand.university")}</h1>
            <p className="mt-1 text-sm text-muted">{t("brand.subtitle")}</p>
          </div>
          <LanguageSwitcher className="border border-line text-ink" />
        </div>

        {telegram ? (
          <>
            <p className="mt-4 text-xs leading-relaxed text-muted">{t("telegram.verifyNotice")}</p>
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
            {mode === "staff" ? t("modeSwitch.toStudent") : t("modeSwitch.toStaff")}
          </button>
        )}

        <p className="mt-4 text-xs leading-relaxed text-muted">{t("footer.privacyNotice")}</p>
      </div>
    </div>
  );
}

function StaffLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation(["login", "common"]);

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
        {t("login:staffForm.usernameLabel")}
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
        {t("common:fields.password")}
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
          {tError(error)}
        </p>
      )}

      <button type="submit" disabled={busy || !username || !password} className="btn btn-primary mt-5 w-full py-2">
        {busy ? "Loading…" : t("login:staffForm.submit")}
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
  const { t } = useTranslation(["login", "common"]);

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
          {t("login:studentForm.mobileLabel")}
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
            {tError(error)}
          </p>
        )}

        <button type="submit" disabled={busy || !mobile} className="btn btn-primary mt-5 w-full py-2">
          {busy ? "Loading…" : t("login:studentForm.phoneStep.continueButton")}
        </button>

        <button
          type="button"
          className="mt-3 w-full text-center text-xs font-semibold text-brand hover:underline"
          onClick={() => setRequesting(true)}
        >
          {t("login:studentForm.phoneStep.accessRequestLink")}
        </button>
      </form>
    );
  }

  const passwordTooShort = needsPassword && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  return (
    <form onSubmit={submitPassword} className="mt-6">
      <label className="label">{t("login:studentForm.mobileLabel")}</label>
      <p className="field bg-plane text-muted">{mobile}</p>

      <label className="label mt-3" htmlFor="student-password">
        {needsPassword ? t("login:studentForm.passwordStep.createPasswordLabel") : t("common:fields.password")}
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
          {t("login:studentForm.passwordStep.minLengthHint")}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-critical">
          {tError(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !password || (needsPassword && password.length < MIN_PASSWORD_LENGTH)}
        className="btn btn-primary mt-5 w-full py-2"
      >
        {busy
          ? "Loading…"
          : needsPassword
            ? t("login:studentForm.passwordStep.createSubmit")
            : t("login:studentForm.passwordStep.loginSubmit")}
      </button>

      <button type="button" className="mt-3 w-full text-center text-xs font-semibold text-ink2 hover:underline" onClick={goBack}>
        {t("common:actions.back")}
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
  const { t } = useTranslation(["login", "common"]);

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
        <p className="text-sm text-ink2">{t("login:accessRequestForm.submittedNotice")}</p>
        <button
          type="button"
          className="mt-4 w-full text-center text-xs font-semibold text-ink2 hover:underline"
          onClick={onBack}
        >
          {t("common:actions.back")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <p className="text-xs leading-relaxed text-muted">{t("login:accessRequestForm.intro")}</p>

      <label className="label mt-3" htmlFor="req-name">
        {t("login:accessRequestForm.nameLabel")}
      </label>
      <input id="req-name" autoFocus className="field" value={nameKo} onChange={(e) => setNameKo(e.target.value)} />

      <label className="label mt-3" htmlFor="req-birth">
        {t("login:accessRequestForm.birthDateLabel")}
      </label>
      <input
        id="req-birth"
        type="date"
        className="field"
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
      />

      <label className="label mt-3" htmlFor="req-mobile">
        {t("login:accessRequestForm.mobileLabel")}
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
          {tError(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !nameKo || !birthDate || !mobile}
        className="btn btn-primary mt-5 w-full py-2"
      >
        {busy ? "Loading…" : t("login:accessRequestForm.submitButton")}
      </button>

      <button type="button" className="mt-3 w-full text-center text-xs font-semibold text-ink2 hover:underline" onClick={onBack}>
        {t("common:actions.back")}
      </button>
    </form>
  );
}
