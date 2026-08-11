import type { AchievementInput, EmployeeInput, SessionUser } from "@thongnhat/shared";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV
  ? "http://localhost:8787"
  : "https://thong-nhat-rewards-api.thuan.workers.dev");
let authToken = sessionStorage.getItem("tn_token") || "";

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export function setToken(token: string) {
  authToken = token;
  token ? sessionStorage.setItem("tn_token", token) : sessionStorage.removeItem("tn_token");
}
export function hasToken() { return Boolean(authToken); }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(data.error || "Không thể kết nối máy chủ.", response.status);
  return data as T;
}

export const api = {
  login: (username: string, password: string) => request<{ token: string; user: SessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: SessionUser }>("/api/me"),
  dashboard: (year: number) => request<Record<string, unknown>>(`/api/dashboard?year=${year}`),
  employees: (query = "") => request<{ items: Array<Record<string, unknown>>; total: number }>(`/api/employees?${query}`),
  employee: (id: string) => request<Record<string, unknown>>(`/api/employees/${id}`),
  options: () => request<{ units: string[]; education: string[]; positions: string[] }>("/api/employees/options"),
  createEmployee: (data: EmployeeInput) => request<{ id: string }>("/api/employees", { method: "POST", body: JSON.stringify(data) }),
  importEmployees: (rows: EmployeeInput[]) => request<{ accepted: number; rejected: number; errors: unknown[] }>("/api/employees/import", { method: "POST", body: JSON.stringify({ rows }) }),
  createAchievement: (data: AchievementInput) => request<{ id: string }>("/api/achievements", { method: "POST", body: JSON.stringify(data) }),
  uploadAchievementFile: (achievementId: string, file: File) => {
    const body = new FormData(); body.append("file", file);
    return request<{ id: string; fileName: string }>(`/api/achievements/${achievementId}/attachments`, { method: "POST", body });
  },
  candidates: (year: number) => request<{ candidates: Array<Record<string, unknown>> }>(`/api/reward-candidates?year=${year}`),
  rewardRules: () => request<{ items: Array<Record<string, unknown>> }>("/api/reward-rules"),
  createRewardRule: (data: {
    name: string;
    rewardType: string;
    rewardLevel: string;
    conditions: { all: Array<{ type: string; level: string }> };
    priority: number;
  }) => request<{ id: string }>("/api/reward-rules", { method: "POST", body: JSON.stringify(data) }),
  users: () => request<{ items: Array<Record<string, unknown>> }>("/api/users"),
  createUser: (data: Record<string, string>) => request("/api/users", { method: "POST", body: JSON.stringify(data) })
};
