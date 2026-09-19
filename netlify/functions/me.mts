import type { Config } from "@netlify/functions";
import { getSession } from "../lib/auth.mts";
import { handler, json } from "../lib/http.mts";

export default handler(async (req) => {
  const session = await getSession(req);
  return json({ authed: session !== null, role: session?.role ?? null });
});

export const config: Config = { path: "/api/me" };
