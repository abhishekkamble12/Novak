import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type {
  ApiSuccess,
  AuthResult,
  CreatePostInput,
  PostDto,
  SearchResponse,
  TrendingTag,
  UpdateProfileInput,
  UserSummary,
} from "@novak/contracts";
import { useAuthStore } from "../store/useAuthStore";

/** "/api" (same origin: Vite proxy locally, Vercel rewrite in production) or an absolute URL. */
export const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE,
  // Sends the httpOnly refresh cookie to /api/auth/*
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

// One refresh in flight at a time: concurrent 401s all wait on the same promise. Rotation
// makes this matter, since a second refresh with the same cookie would revoke the session.
let refreshing: Promise<AuthResult | null> | null = null;

export function refreshSession(): Promise<AuthResult | null> {
  refreshing ??= axios
    .post<ApiSuccess<AuthResult>>(`${API_BASE}/auth/refresh`, null, { withCredentials: true })
    .then((res) => {
      useAuthStore.getState().setSession(res.data.data);
      return res.data.data;
    })
    .catch(() => {
      useAuthStore.getState().clear();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export const NOT_API_MESSAGE =
  "The server returned something other than the Novak API. Check that /api is routed to the API.";

api.interceptors.response.use(
  (res) => {
    // A misrouted /api (e.g. a static host serving index.html) answers 200 with HTML. Treat it
    // as an error here instead of letting `res.data.data` be undefined further down.
    const body = res.data as { success?: unknown } | undefined;
    if (!body || typeof body !== "object" || body.success !== true) {
      return Promise.reject(new AxiosError(NOT_API_MESSAGE, "ERR_NOT_API", res.config, res.request, res));
    }
    return res;
  },
  async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const isAuthCall = config?.url?.startsWith("/auth/");
  if (
    error.response?.status === 401 &&
    config &&
    !config._retried &&
    !isAuthCall &&
    useAuthStore.getState().accessToken
  ) {
    config._retried = true;
    const session = await refreshSession();
    if (session) return api(config);
  }
  return Promise.reject(error);
  }
);

/** Human-readable message from an API error envelope, or a network-level fallback. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(err)) {
    if (err.code === "ERR_NOT_API") return NOT_API_MESSAGE;
    const message = (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
    if (message) return message;
    if (!err.response) return "Can't reach the server. Check your connection.";
  }
  return fallback;
}

export function isNotFound(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

const data = <T>(res: { data: ApiSuccess<T> }) => res.data.data;
const page = <T>(res: { data: ApiSuccess<T[]> }): Page<T> => ({
  items: res.data.data,
  nextCursor: res.data.meta?.hasMore ? res.data.meta.cursor ?? null : null,
});

export const authApi = {
  login: (emailOrUsername: string, password: string) =>
    api.post<ApiSuccess<AuthResult>>("/auth/login", { emailOrUsername, password }).then(data),
  register: (input: { username: string; email: string; password: string; name: string }) =>
    api.post<ApiSuccess<AuthResult>>("/auth/register", input).then(data),
  logout: () => api.post("/auth/logout"),
};

export const postsApi = {
  feed: (cursor?: string) =>
    api.get<ApiSuccess<PostDto[]>>("/posts/feed", { params: { cursor, limit: 10 } }).then(page),
  get: (id: string) => api.get<ApiSuccess<PostDto>>(`/posts/${id}`).then(data),
  create: (input: CreatePostInput) => api.post<ApiSuccess<PostDto>>("/posts", input).then(data),
  remove: (id: string) => api.delete(`/posts/${id}`),
  reprocess: (id: string) => api.post<ApiSuccess<PostDto>>(`/posts/${id}/reprocess`).then(data),
  like: (id: string) =>
    api.post<ApiSuccess<{ liked: boolean; likesCount: number }>>(`/posts/${id}/like`).then(data),
  unlike: (id: string) =>
    api.delete<ApiSuccess<{ liked: boolean; likesCount: number }>>(`/posts/${id}/like`).then(data),
  trendingTags: () => api.get<ApiSuccess<TrendingTag[]>>("/posts/trending-tags").then(data),
};

export const usersApi = {
  get: (username: string) => api.get<ApiSuccess<UserSummary>>(`/users/${username}`).then(data),
  posts: (username: string, cursor?: string) =>
    api
      .get<ApiSuccess<PostDto[]>>(`/users/${username}/posts`, { params: { cursor, limit: 12 } })
      .then(page),
  suggestions: () => api.get<ApiSuccess<UserSummary[]>>("/users/suggestions").then(data),
  updateMe: (input: UpdateProfileInput) => api.patch<ApiSuccess<UserSummary>>("/users/me", input).then(data),
};

export const searchApi = {
  search: (q: string, tag?: string) =>
    api.get<ApiSuccess<SearchResponse>>("/search", { params: { q, tag } }).then(data),
};
