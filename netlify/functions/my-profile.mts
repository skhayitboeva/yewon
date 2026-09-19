import type { Config } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { hashPassword, requireStudent, verifyPassword } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { parseOrThrow, studentProfileSchema } from "../lib/schema.mts";
import { mobileMatchExpr, withoutPasswordHash } from "../lib/students.mts";

export default handler(async (req) => {
  if (req.method !== "PATCH") throw new HttpError(405, "지원하지 않는 메서드입니다.");

  const sid = await requireStudent(req);
  const patch = parseOrThrow(studentProfileSchema, await readJson(req));
  const students = await coll(COLLECTIONS.students);
  const _id = new ObjectId(sid);

  const current = await students.findOne({ _id });
  if (!current) throw new HttpError(404, "학생을 찾을 수 없습니다.");

  const changingMobile = patch.mobile !== undefined && patch.mobile !== current.mobile;
  const changingPassword = Boolean(patch.newPassword);

  if (changingMobile || changingPassword) {
    if (!patch.currentPassword) {
      throw new HttpError(400, "현재 비밀번호를 입력하세요.");
    }
    if (!current.passwordHash || !(await verifyPassword(patch.currentPassword, current.passwordHash))) {
      throw new HttpError(401, "현재 비밀번호가 올바르지 않습니다.");
    }
  }

  if (changingMobile) {
    const clash = await students.findOne({
      _id: { $ne: _id },
      enrollStatus: { $ne: "삭제" },
      ...mobileMatchExpr(patch.mobile as string),
    });
    if (clash) throw new HttpError(409, "이미 사용 중인 휴대전화 번호입니다.");
  }

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  const selfEditedUpdate: Record<string, boolean> = {};

  if (patch.nameKo !== undefined && patch.nameKo !== current.nameKo) {
    $set.nameKo = patch.nameKo;
    selfEditedUpdate["selfEdited.nameKo"] = true;
  }
  if (patch.address !== undefined && patch.address !== current.address) {
    $set.address = patch.address;
    selfEditedUpdate["selfEdited.address"] = true;
  }
  if (changingMobile) {
    $set.mobile = patch.mobile;
    selfEditedUpdate["selfEdited.mobile"] = true;
  }
  if (changingPassword) {
    $set.passwordHash = await hashPassword(patch.newPassword as string);
  }

  Object.assign($set, selfEditedUpdate);

  if (Object.keys($set).length === 1) {
    // Only updatedAt — nothing actually changed.
    throw new HttpError(400, "변경할 항목이 없습니다.");
  }

  const updated = await students.findOneAndUpdate(
    { _id },
    { $set },
    { returnDocument: "after" }
  );
  if (!updated) throw new HttpError(404, "학생을 찾을 수 없습니다.");
  return json(withoutPasswordHash(updated));
});

export const config: Config = { path: "/api/my/profile" };
