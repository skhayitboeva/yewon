import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api";
import { tError } from "../i18n";
import type { Role } from "../../shared/domain";

const MIN_PASSWORD_LENGTH = 5;
const MOBILE_MAX_DIGITS = 11;

export function Profile({
  role,
  onToast,
}: {
  role: Role;
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const { t } = useTranslation("profile");

  if (role !== "user") {
    return (
      <div className="mx-auto max-w-[500px] p-4 sm:p-6">
        <div className="card p-5">
          <h2 className="text-base font-bold">{t("title")}</h2>
          <div className="mt-4">
            <div className="label">{t("roleLabel")}</div>
            <div className="text-sm text-ink">{role === "admin" ? t("roleAdmin") : t("roleManager")}</div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">{t("staffPasswordNotice")}</p>
        </div>
      </div>
    );
  }

  return <StudentProfile onToast={onToast} />;
}

function StudentProfile({
  onToast,
}: {
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const { t } = useTranslation(["profile", "common"]);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["myDetails"], queryFn: api.myDetails });

  const [nameKo, setNameKo] = useState("");
  const [address, setAddress] = useState("");
  const [mobile, setMobile] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (data?.student) {
      setNameKo(data.student.nameKo);
      setAddress(data.student.address);
      setMobile(data.student.mobile.replace(/[^\d]/g, ""));
    }
  }, [data?.student]);

  if (isLoading || !data) return <p className="p-6 text-sm text-muted">{t("loading")}</p>;

  const s = data.student;
  const mobileChanged = mobile !== s.mobile.replace(/[^\d]/g, "");
  const wantsPasswordChange = newPassword.length > 0;
  const needsCurrentPassword = mobileChanged || wantsPasswordChange;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (wantsPasswordChange && newPassword.length < MIN_PASSWORD_LENGTH) {
      setError("비밀번호는 5자 이상이어야 합니다.");
      return;
    }

    const body: Record<string, string> = {};
    if (nameKo !== s.nameKo) body.nameKo = nameKo;
    if (address !== s.address) body.address = address;
    if (mobileChanged) body.mobile = mobile;
    if (wantsPasswordChange) body.newPassword = newPassword;
    if (needsCurrentPassword) body.currentPassword = currentPassword;

    if (Object.keys(body).length === 0 || (Object.keys(body).length === 1 && "currentPassword" in body)) {
      onToast("error", tError("변경할 항목이 없습니다."));
      return;
    }

    setBusy(true);
    try {
      await api.updateMyProfile(body);
      await qc.invalidateQueries({ queryKey: ["myDetails"] });
      onToast("ok", t("savedToast"));
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[500px] p-4 sm:p-6">
      <form onSubmit={submit} className="card space-y-4 p-5">
        <h2 className="text-base font-bold">{t("title")}</h2>

        <div>
          <label className="label" htmlFor="profile-name">
            {t("nameLabel")}
          </label>
          <input
            id="profile-name"
            className="field"
            value={nameKo}
            onChange={(e) => setNameKo(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="profile-address">
            {t("addressLabel")}
          </label>
          <input
            id="profile-address"
            className="field"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="profile-mobile">
            {t("mobileLabel")}
          </label>
          <input
            id="profile-mobile"
            type="tel"
            inputMode="numeric"
            className="field"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/[^\d]/g, "").slice(0, MOBILE_MAX_DIGITS))}
          />
        </div>

        <div className="border-t border-line pt-4">
          <label className="label" htmlFor="profile-new-password">
            {t("newPasswordLabel")}
          </label>
          <input
            id="profile-new-password"
            type="password"
            autoComplete="new-password"
            className="field"
            placeholder={t("newPasswordPlaceholder")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        {needsCurrentPassword && (
          <div>
            <label className="label" htmlFor="profile-current-password">
              {t("currentPasswordLabel")}
            </label>
            <input
              id="profile-current-password"
              type="password"
              autoComplete="current-password"
              className="field"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted">{t("currentPasswordHint")}</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-critical">
            {tError(error)}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary w-full py-2">
          {busy ? "Loading…" : t("common:actions.save")}
        </button>
      </form>
    </div>
  );
}
