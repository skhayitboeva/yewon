import type { Config } from "@netlify/functions";
import { COLLECTIONS, coll } from "../lib/db.mts";
import { clientIp, enforceLoginRateLimit, recordLoginFailure, requireRole } from "../lib/auth.mts";
import { HttpError, handler, json, readJson } from "../lib/http.mts";
import { accessRequestSchema, parseOrThrow } from "../lib/schema.mts";
import { withoutPasswordHash } from "../lib/students.mts";

export default handler(async (req) => {
  if (req.method === "POST") {
    // Unauthenticated by necessity — the requester isn't in the system yet.
    // The rate limiter is the load-bearing defense against spam here.
    const ip = clientIp(req);
    await enforceLoginRateLimit(ip);

    const input = parseOrThrow(accessRequestSchema, await readJson(req));
    const requests = await coll(COLLECTIONS.accessRequests);
    await requests.insertOne({ ...input, status: "pending", createdAt: new Date() });
    // Consumes rate-limit budget on every submission, not just failed ones —
    // this endpoint has no legitimate reason to be called often per IP.
    await recordLoginFailure(ip);
    return json({ ok: true }, { status: 201 });
  }

  if (req.method === "GET") {
    await requireRole(req, ["admin"]);
    const requests = await coll(COLLECTIONS.accessRequests);
    const students = await coll(COLLECTIONS.students);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";
    const rows = await requests.find({ status }).sort({ createdAt: -1 }).toArray();

    const withCandidates = await Promise.all(
      rows.map(async (r) => {
        const candidates = await students
          .find({ nameKo: r.nameKo, birthDate: r.birthDate, enrollStatus: { $ne: "삭제" } })
          .toArray();
        return { ...r, candidates: candidates.map((c) => withoutPasswordHash(c)) };
      })
    );

    return json({ requests: withCandidates });
  }

  throw new HttpError(405, "지원하지 않는 메서드입니다.");
});

export const config: Config = { path: "/api/access-requests" };
