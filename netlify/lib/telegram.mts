import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http.mts";

/** initData older than this is rejected, so a leaked string can't be replayed. */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

export interface TelegramUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new HttpError(500, "TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다.");
  return token;
}

/**
 * Verifies Telegram's signed initData and returns the user it describes.
 *
 * Note the key/data order, which is easy to get backwards: the secret key is
 * HMAC over the *bot token* keyed by the literal "WebAppData", and only then is
 * the check string hashed with that secret as the key.
 */
export function validateInitData(initData: string): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new HttpError(401, "텔레그램 인증 정보가 올바르지 않습니다.");

  const checkString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken()).digest();
  const expected = createHmac("sha256", secretKey).update(checkString).digest("hex");

  const actualBuf = Buffer.from(hash, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new HttpError(401, "텔레그램 인증 정보가 올바르지 않습니다.");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new HttpError(401, "텔레그램 인증이 만료되었습니다. 앱을 다시 열어주세요.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(params.get("user") || "");
  } catch {
    throw new HttpError(401, "텔레그램 사용자 정보를 읽을 수 없습니다.");
  }
  if (!parsed?.id) throw new HttpError(401, "텔레그램 사용자 정보를 읽을 수 없습니다.");

  return {
    id: String(parsed.id),
    firstName: String(parsed.first_name ?? ""),
    lastName: String(parsed.last_name ?? ""),
    username: String(parsed.username ?? ""),
  };
}

export interface SendResult {
  ok: boolean;
  /** True when Telegram says the user blocked the bot or the chat is gone —
   * the caller should stop treating that binding as deliverable. */
  unreachable: boolean;
}

export async function sendMessage(chatId: string, text: string): Promise<SendResult> {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });

  if (res.ok) return { ok: true, unreachable: false };

  const body = (await res.json().catch(() => ({}))) as { description?: string };
  const description = body.description || "";
  const unreachable =
    res.status === 403 || /chat not found|user is deactivated|bot was blocked/i.test(description);
  return { ok: false, unreachable };
}
