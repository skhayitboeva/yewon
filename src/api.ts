import type {
  Consultation,
  Settings,
  Stats,
  Student,
} from "../shared/domain";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });

  if (!res.ok) {
    let message = `요청이 실패했습니다 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
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
  me: () => request<{ authed: boolean }>("/api/me"),
  login: (password: string) =>
    request<{ ok: true }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ ok: true }>("/api/logout", { method: "POST" }),

  stats: () => request<Stats>("/api/stats"),
  facets: () => request<{ majors: string[]; cohorts: string[] }>("/api/facets"),

  students: (query: string) => request<StudentPage>(`/api/students?${query}`),
  createStudent: (body: Partial<Student>) =>
    request<Student>("/api/students", { method: "POST", body: JSON.stringify(body) }),
  patchStudent: (id: string, body: Record<string, unknown>) =>
    request<Student>(`/api/students/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteStudent: (id: string) =>
    request<{ ok: true }>(`/api/students/${id}`, { method: "DELETE" }),
  bulkPatch: (body: {
    ids?: string[];
    all?: boolean;
    filter?: Record<string, string>;
    set: Record<string, string>;
  }) =>
    request<{ matched: number; modified: number }>("/api/students-bulk", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

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
};
