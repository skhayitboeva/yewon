/** Thin wrapper around the `window.Telegram.WebApp` object injected by
 * https://telegram.org/js/telegram-web-app.js (loaded in index.html). Every
 * call is guarded because this script is a no-op outside Telegram, so the
 * regular browser app must keep working exactly as before. */

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme: "light" | "dark";
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function webApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

/** True only when running inside Telegram and initData was actually signed —
 * opening the same URL in a plain browser must not look like a Telegram session. */
export function isTelegram(): boolean {
  return Boolean(webApp()?.initData);
}

export function getInitData(): string {
  return webApp()?.initData ?? "";
}

export function prepareTelegramViewport(): void {
  const app = webApp();
  if (!app) return;
  app.ready();
  app.expand();
}
