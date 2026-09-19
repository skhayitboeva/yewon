import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "로그인에 실패했습니다.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 shadow-sm">
        <h1 className="text-lg font-bold">예원예술대학교</h1>
        <p className="mt-1 text-sm text-muted">유학생 관리 시스템</p>

        <label className="label mt-6" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-critical">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || !password} className="btn btn-primary mt-5 w-full py-2">
          {busy ? "확인 중…" : "로그인"}
        </button>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          학생 개인정보가 포함된 시스템입니다. 비밀번호를 외부에 공유하지 마세요.
        </p>
      </form>
    </div>
  );
}
