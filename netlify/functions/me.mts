import type { Config } from "@netlify/functions";
import { isAuthed } from "../lib/auth.mts";
import { handler, json } from "../lib/http.mts";

export default handler(async (req) => json({ authed: await isAuthed(req) }));

export const config: Config = { path: "/api/me" };
