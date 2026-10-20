import { useEffect } from "react";
import { io } from "socket.io-client";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { PostDto, PostProcessedEvent } from "@novak/contracts";
import { useAuthStore } from "../store/useAuthStore";
import { API_BASE, refreshSession } from "./api";
import { postKeys, updatePost } from "./postCache";

// While any of my posts is still processing, re-fetch at this interval. Covers events missed
// while the socket was down, and hosts where WebSockets don't work at all.
export const PENDING_POLL_MS = 15_000;

// Socket.IO needs a direct connection: Vercel rewrites don't proxy WebSockets. Falls back to
// the API origin when VITE_API_URL is absolute, else the page origin (Vite proxy in dev).
function socketUrl(): string | undefined {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (/^https?:\/\//.test(API_BASE)) return new URL(API_BASE).origin;
  return undefined;
}

export function applyProcessedEvent(qc: QueryClient, event: PostProcessedEvent) {
  updatePost(qc, event.postId, (p) => ({
    ...p,
    moderationStatus: event.moderationStatus,
    moderationReason: event.moderationReason,
    processingStatus: event.processingStatus,
    searchIndexed: event.searchIndexed,
    aiTags: event.aiTags,
  }));
}

/** True if any cached post by this user is still waiting for analysis. */
export function hasPendingOwnPost(qc: QueryClient, userId: string): boolean {
  return qc.getQueriesData<unknown>({ queryKey: postKeys.all }).some(([, data]) => {
    const posts: PostDto[] = !data
      ? []
      : typeof data === "object" && "pages" in data
        ? (data as { pages: { items: PostDto[] }[] }).pages.flatMap((pg) => pg.items)
        : typeof data === "object" && "results" in data
          ? (data as { results: PostDto[] }).results
          : [data as PostDto];
    return posts.some((p) => p.authorId === userId && p.processingStatus === "pending");
  });
}

/**
 * Keeps the signed-in user's posts in sync with background analysis. Socket events are the
 * fast path; they are best-effort, so the cache is also re-fetched after every (re)connect
 * and polled while something is pending. The server's state is always the source of truth.
 */
export function useRealtime() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!userId) return;

    const options = {
      // A function, so every reconnect presents the current (possibly refreshed) token
      auth: (cb: (data: object) => void) => cb({ token: useAuthStore.getState().accessToken }),
      withCredentials: true,
    };
    const url = socketUrl();
    const socket = url ? io(url, options) : io(options);

    let connectedBefore = false;
    socket.on("connect", () => {
      // Anything processed while we were disconnected was emitted into the void
      if (connectedBefore) void qc.invalidateQueries({ queryKey: postKeys.all });
      connectedBefore = true;
    });

    socket.on("post:processed", (event: PostProcessedEvent) => applyProcessedEvent(qc, event));

    socket.on("connect_error", async (err) => {
      // Access token expired while disconnected: refresh once, then retry
      if (err.message === "UNAUTHORIZED" && (await refreshSession())) socket.connect();
    });

    const poll = setInterval(() => {
      if (hasPendingOwnPost(qc, userId)) void qc.invalidateQueries({ queryKey: postKeys.all });
    }, PENDING_POLL_MS);

    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [userId, qc]);
}
