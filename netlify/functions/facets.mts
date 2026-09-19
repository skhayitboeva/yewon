import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { requireRole } from "../lib/auth.mts";
import { handler, json } from "../lib/http.mts";

/** Feeds the filter dropdowns with the values that actually exist in the data. */
export default handler(async (req) => {
  await requireRole(req, ["admin", "manager"]);
  const students = await coll(COLLECTIONS.students);

  const [majors, cohorts] = await Promise.all([
    students.distinct("major"),
    students.distinct("admissionDate"),
  ]);

  const cohortSet = new Set<string>();
  for (const d of cohorts as string[]) {
    if (typeof d === "string" && d.length >= 7) {
      cohortSet.add(`${d.slice(0, 4)}-${Number(d.slice(5, 7)) >= 7 ? 2 : 1}`);
    }
  }

  return json({
    majors: (majors as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")),
    cohorts: [...cohortSet].sort(),
  });
});

export const config: Config = { path: "/api/facets" };
