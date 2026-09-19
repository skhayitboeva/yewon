import type { Config } from "@netlify/functions";
import { clearCookie } from "../lib/auth.mts";
import { handler, json } from "../lib/http.mts";

export default handler(async () =>
  json({ ok: true }, { headers: { "set-cookie": clearCookie() } })
);

export const config: Config = { path: "/api/logout" };
