import type {
  AccessRequest,
  Consultation,
  Info,
  Role,
  Settings,
  Stats,
  Student,
} from "../shared/domain";
import { getLang, translate } from "./i18n";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Telegram's WebView/iframe don't reliably carry cookies, so a session
 * obtained via /api/telegram/auth or /api/telegram/link is held here (and
 * mirrored to sessionStorage so a reload inside the Mini App survives)
 * instead. The web app's staff/student login is unaffected — it keeps using
 * the cookie the server already sets. */
const TOKEN_STORAGE_KEY = "yewon_tg_token";
let bearerToken: string | null = sessionStorage.getItem(TOKEN_STORAGE_KEY);

export function setBearerToken(token: string | null): void {
  bearerToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* private-mode storage may throw — the in-memory token still works for this tab */
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = init?.body ? { "content-type": "application/json" } : {};
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;

  const res = await fetch(path, {
    credentials: "same-origin",
    headers,
    ...init,
  });

  if (!res.ok) {
    let message =
      getLang() === "en" ? `Request failed (${res.status})` : `요청이 실패했습니다 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = translate(body.error);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface StudentPage {
  rows: Student[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const api = {
  me: () => request<{ authed: boolean; role: Role | null }>("/api/me"),
  login: (username: string, password: string) =>
    request<{ ok: true }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>("/api/logout", { method: "POST" }),
  studentLogin: (mobile: string, password?: string) =>
    request<{ ok?: true; needsPassword?: boolean }>("/api/student-login", {
      method: "POST",
      body: JSON.stringify(password ? { mobile, password } : { mobile }),
    }),

  telegramAuth: (initData: string) =>
    request<{ linked: boolean; token?: string }>("/api/telegram/auth", {
      method: "POST",
      body: JSON.stringify({ initData }),
    }),
  telegramLink: (initData: string, mobile: string, password: string) =>
    request<{ token: string }>("/api/telegram/link", {
      method: "POST",
      body: JSON.stringify({ initData, mobile, password }),
    }),
  submitAccessRequest: (body: { nameKo: string; birthDate: string; mobile: string }) =>
    request<{ ok: true }>("/api/access-requests", { method: "POST", body: JSON.stringify(body) }),

  accessRequests: () => request<{ requests: AccessRequest[] }>("/api/access-requests?status=pending"),
  resolveAccessRequest: (id: string, body: { action: "approve"; targetId: string } | { action: "reject" }) =>
    request<{ ok: true }>(`/api/access-requests/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  broadcast: (body: { message: string; filters?: Record<string, string>; cursor?: string; limit?: number }) =>
    request<{ sent: number; failed: number; nextCursor: string | null }>("/api/broadcast", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  stats: () => request<Stats>("/api/stats"),
  facets: () => request<{ majors: string[]; cohorts: string[] }>("/api/facets"),

  students: (query: string) => request<StudentPage>(`/api/students?${query}`),
  createStudent: (body: Partial<Student>) =>
    request<Student>("/api/students", { method: "POST", body: JSON.stringify(body) }),
  patchStudent: (id: string, body: Record<string, unknown>) =>
    request<Student>(`/api/students/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteStudent: (id: string) =>
    request<{ ok: true }>(`/api/students/${id}`, { method: "DELETE" }),
  resetStudentPassword: (id: string) =>
    request<{ ok: true }>(`/api/students/${id}/reset-password`, { method: "POST" }),

  consultations: (studentId: string) =>
    request<{ rows: Consultation[] }>(
      `/api/consultations?studentId=${encodeURIComponent(studentId)}`
    ),
  createConsultation: (body: Partial<Consultation>) =>
    request<Consultation>("/api/consultations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchConsultation: (id: string, body: Partial<Consultation>) =>
    request<Consultation>(`/api/consultations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteConsultation: (id: string) =>
    request<{ ok: true }>(`/api/consultations/${id}`, { method: "DELETE" }),

  settings: () => request<Settings>("/api/settings"),
  saveSettings: (body: Settings) =>
    request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),

  info: () => request<Info>("/api/info"),
  saveInfo: (body: Info) => request<Info>("/api/info", { method: "PUT", body: JSON.stringify(body) }),

  myDetails: () =>
    request<{
      student: Student;
      consultations: Consultation[];
      consultCount: number;
      lastConsultedAt: string | null;
    }>("/api/my/details"),
  updateMyProfile: (body: {
    nameKo?: string;
    address?: string;
    mobile?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => request<Student>("/api/my/profile", { method: "PATCH", body: JSON.stringify(body) }),
};
