import type { Collection, Document, WithId } from "mongodb";
import { hashPassword, verifyPassword } from "./auth.mts";

export const MIN_PASSWORD_LENGTH = 5;

/** Never let the self-service login's password hash reach the browser. */
export function withoutPasswordHash(doc: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash, ...rest } = doc;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

/** Stored numbers aren't consistently digits-only (imported data keeps
 * "010-1234-5678" dashes; numbers entered or edited through the app are
 * digits-only) — match with dashes stripped from the stored value too,
 * instead of relying on exact string equality. */
export function mobileMatchExpr(mobile: string): Record<string, unknown> {
  return {
    $expr: {
      $eq: [
        { $replaceAll: { input: { $ifNull: ["$mobile", ""] }, find: "-", replacement: "" } },
        mobile,
      ],
    },
  };
}

export type AuthenticateResult =
  | { status: "not-found" }
  /** `password` was omitted — a status check only, nothing was verified. */
  | { status: "check"; needsPassword: boolean }
  | { status: "password-too-short" }
  | { status: "wrong-password" }
  /** First login for this phone — the submitted password was just set as theirs. */
  | { status: "claimed"; student: WithId<Document> }
  | { status: "verified"; student: WithId<Document> };

/**
 * The one place phone+password claim/verify rules live — shared by the
 * regular student login and Telegram account linking, so they can't drift
 * apart. `password` omitted means "just tell me whether one is needed yet".
 */
export async function authenticateByMobile(
  students: Collection<Document>,
  mobile: string,
  password?: string
): Promise<AuthenticateResult> {
  const student = await students.findOne({
    enrollStatus: { $ne: "삭제" },
    ...mobileMatchExpr(mobile),
  });
  if (!student) return { status: "not-found" };

  if (!password) {
    return { status: "check", needsPassword: !student.passwordHash };
  }

  if (!student.passwordHash) {
    if (password.length < MIN_PASSWORD_LENGTH) return { status: "password-too-short" };
    const passwordHash = await hashPassword(password);
    await students.updateOne({ _id: student._id }, { $set: { passwordHash, updatedAt: new Date() } });
    return { status: "claimed", student: { ...student, passwordHash } };
  }

  const ok = await verifyPassword(password, student.passwordHash);
  return ok ? { status: "verified", student } : { status: "wrong-password" };
}
