import { useEffect } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import type { PostProcessedEvent } from "@novak/contracts";
import { useAuthStore } from "../store/useAuthStore";
import { API_BASE, refreshSession } from "./api";
import { updatePost } from "./postCache";

// Socket.IO needs a direct connection: Vercel rewrites don't proxy WebSockets. Falls back to
// the API origin when VITE_API_URL is absolute, else the page origin (Vite proxy in dev).
function socketUrl(): string | undefined {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (/^https?:\/\//.test(API_BASE)) return new URL(API_BASE).origin;
  return undefined;
}

/** Pushes AI-analysis results for the signed-in user's posts into the query cache. */
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

    socket.on("post:processed", (event: PostProcessedEvent) => {
      updatePost(qc, event.postId, (p) => ({
        ...p,
        moderationStatus: event.moderationStatus,
        aiTags: event.aiTags,
      }));
    });

    socket.on("connect_error", async (err) => {
      // Access token expired while disconnected: refresh once, then retry
      if (err.message === "UNAUTHORIZED" && (await refreshSession())) socket.connect();
    });

    return () => {
      socket.disconnect();
    };
  }, [userId, qc]);
}
