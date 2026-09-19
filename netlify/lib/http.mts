const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers as Record<string, string>) },
  });
}

export function fail(status: number, message: string, extra?: unknown): Response {
  return json({ error: message, ...(extra ? { detail: extra } : {}) }, { status });
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

/** Wraps a handler so thrown errors become clean JSON instead of a 502. */
export function handler(
  fn: (req: Request, ctx: any) => Promise<Response>
): (req: Request, ctx: any) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message, err.detail);
      // Never echo a Mongo connection string or stack back to the browser.
      console.error("[api]", err);
      return fail(500, "서버 오류가 발생했습니다.");
    }
  };
}

export async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "요청 본문이 올바른 JSON이 아닙니다.");
  }
}

export function noStoreText(body: string, contentType: string, filename?: string): Response {
  const headers: Record<string, string> = {
    "content-type": contentType,
    "cache-control": "no-store",
  };
  if (filename) {
    headers["content-disposition"] =
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  return new Response(body, { headers });
}
