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
