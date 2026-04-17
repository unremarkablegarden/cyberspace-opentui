import { getSession, setTokens, clearSession } from "../auth/session.ts";
import { hydrateDates } from "./types.ts";

export const API_BASE_URL = "https://api.cyberspace.online";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class AuthExpiredError extends ApiError {
  constructor() {
    super("authentication expired", 401, "AUTH_EXPIRED");
    this.name = "AuthExpiredError";
  }
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  auth?: boolean;
}

function buildUrl(path: string, query?: ApiFetchOptions["query"]): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function doFetch<T>(path: string, opts: ApiFetchOptions, idToken: string | null): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth && idToken) headers["Authorization"] = `Bearer ${idToken}`;

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const message = (isJson && payload && typeof payload === "object" && "message" in payload && typeof (payload as { message?: unknown }).message === "string"
      ? (payload as { message: string }).message
      : res.statusText) || `HTTP ${res.status}`;
    const code = isJson && payload && typeof payload === "object" && "code" in payload && typeof (payload as { code?: unknown }).code === "string"
      ? (payload as { code: string }).code
      : undefined;
    throw new ApiError(message, res.status, code);
  }

  if (payload && typeof payload === "object") hydrateDates(payload);
  return payload as T;
}

async function refreshOnce(refreshToken: string): Promise<string | null> {
  try {
    const wrapped = await doFetch<{ data?: { idToken?: string; refreshToken?: string } }>(
      "/v1/auth/refresh",
      { method: "POST", body: { refreshToken } },
      null,
    );
    const data = wrapped?.data;
    if (!data?.idToken) return null;
    setTokens({
      idToken: data.idToken,
      refreshToken: data.refreshToken ?? refreshToken,
    });
    return data.idToken;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const session = getSession();
  const idToken = opts.auth ? session?.idToken ?? null : null;

  try {
    return await doFetch<T>(path, opts, idToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !opts.auth) throw err;
    if (!session?.refreshToken) {
      clearSession();
      throw new AuthExpiredError();
    }
    const fresh = await refreshOnce(session.refreshToken);
    if (!fresh) {
      clearSession();
      throw new AuthExpiredError();
    }
    return await doFetch<T>(path, opts, fresh);
  }
}
