import type http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { PostProcessedEvent } from "@novak/contracts";
import { logger } from "../config/logger.js";
import { redis } from "../config/redis.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";
import type { createOriginMatcher } from "../utils/origins.js";

let io: SocketIOServer | null = null;

const userRoom = (userId: string) => `user:${userId}`;

export function createSocketServer(
  httpServer: http.Server,
  isAllowedOrigin: ReturnType<typeof createOriginMatcher>
) {
  // Socket.IO gets its own pub/sub connections. The adapter calls subscribe() without a
  // .catch(), so these must queue while Redis is down (no timeout, unlimited retries)
  // instead of rejecting, which would crash the process with an unhandled rejection.
  const pubClient = redis.duplicate({ commandTimeout: undefined, maxRetriesPerRequest: null });
  const subClient = pubClient.duplicate();
  for (const client of [pubClient, subClient]) {
    client.on("error", (err) => logger.warn({ err }, "Socket.IO Redis client error"));
  }

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)),
      credentials: true,
    },
    adapter: createAdapter(pubClient, subClient),
  });

  // Clients authenticate with the same short-lived access token used for REST calls
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") return next(new Error("UNAUTHORIZED"));
    try {
      socket.data.userId = verifyAccessToken(token).sub;
      return next();
    } catch {
      return next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const userId: string = socket.data.userId;
    void socket.join(userRoom(userId));
    logger.debug({ socketId: socket.id, userId }, "Socket connected");
    socket.on("disconnect", (reason) => {
      logger.debug({ socketId: socket.id, reason }, "Socket disconnected");
    });
  });

  const close = async () => {
    io?.close();
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
  };

  return { io, close };
}

export function emitPostProcessed(userId: string, event: PostProcessedEvent) {
  io?.to(userRoom(userId)).emit("post:processed", event);
}
