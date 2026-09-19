import type { Config } from "@netlify/functions";
import { ObjectId } from "mongodb";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireAuth } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { bulkPatchSchema, parseOrThrow } from "../lib/schema.mts";
import { filterFromObject } from "../lib/query.mts";

/**
 * Bulk edit — the 신입생/재학생 switch at the start of a semester is the reason
 * this exists: hundreds of rows change at once.
 */
export default handler(async (req) => {
  await requireAuth(req);
  if (req.method !== "PATCH") throw new HttpError(405, "PATCH만 허용됩니다.");

  const body = parseOrThrow(bulkPatchSchema, await readJson(req));
  const students = await coll(COLLECTIONS.students);

  let filter: Record<string, unknown>;
  if (body.all) {
    filter = filterFromObject(body.filter || {}) as Record<string, unknown>;
  } else {
    const ids = (body.ids || []).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (ids.length === 0) throw new HttpError(400, "선택된 학생이 없습니다.");
    filter = { _id: { $in: ids } };
  }

  const res = await students.updateMany(filter, {
    $set: { ...body.set, updatedAt: new Date() },
  });

  return json({ matched: res.matchedCount, modified: res.modifiedCount });
});

export const config: Config = { path: "/api/students-bulk" };
