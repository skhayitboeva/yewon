import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { parseOrThrow, settingsSchema } from "../lib/schema.mts";
import { recomputeAllTotals } from "../lib/attendance.mts";

export default handler(async (req) => {
  const role = await requireRole(req, ["admin", "manager"]);
  const settings = await coll(COLLECTIONS.settings);

  if (req.method === "GET") {
    const doc = await settings.findOne({ _id: "app" as any });
    return json({
      currentYear: doc?.currentYear ?? new Date().getFullYear(),
      currentSemester: doc?.currentSemester ?? 2,
    });
  }

  if (req.method === "PUT") {
    if (role !== "admin") throw new HttpError(403, "권한이 없습니다.");
    const input = parseOrThrow(settingsSchema, await readJson(req));
    const prev = await settings.findOne({ _id: "app" as any });
    await settings.updateOne(
      { _id: "app" as any },
      { $set: { ...input, updatedAt: new Date() } },
      { upsert: true }
    );
    // 학기가 바뀌면 결석/지각 총계는 "이번 학기" 값이어야 한다 — 안 그러면
    // 지난 학기 숫자가 그대로 남아 F 위험 필터/통계를 오염시킨다.
    if (prev?.currentYear !== input.currentYear || prev?.currentSemester !== input.currentSemester) {
      await recomputeAllTotals(input.currentYear, input.currentSemester);
    }
    return json(input);
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/settings" };
