import { apiFetch } from "./client.ts";
import type { AuthTokens, Paginated, Post, Reply } from "./types.ts";

interface Single<T> {
  data: T;
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const res = await apiFetch<Single<AuthTokens>>("/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return res.data;
}

export async function refreshToken(
  refreshToken: string,
): Promise<{ idToken: string; rtdbToken?: string }> {
  const res = await apiFetch<Single<{ idToken: string; rtdbToken?: string }>>(
    "/v1/auth/refresh",
    { method: "POST", body: { refreshToken } },
  );
  return res.data;
}

export async function listPosts(opts: { limit?: number; cursor?: string } = {}): Promise<Paginated<Post>> {
  return apiFetch<Paginated<Post>>("/v1/posts", {
    method: "GET",
    query: { limit: opts.limit, cursor: opts.cursor },
    auth: true,
  });
}

export async function getReplies(
  postId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<Paginated<Reply>> {
  return apiFetch<Paginated<Reply>>(`/v1/posts/${encodeURIComponent(postId)}/replies`, {
    method: "GET",
    query: { limit: opts.limit, cursor: opts.cursor },
    auth: true,
  });
}
