import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { redis, disconnectRedis } from "./config/redis.js";

async function bootstrap() {
  await connectDB();

  const app = createApp();
  const httpServer = http.createServer(app);

  // Socket.IO gets its own pub/sub connections. The adapter calls subscribe() without a
  // .catch(), so these must queue while Redis is down (no timeout, unlimited retries)
  // instead of rejecting, which would crash the process with an unhandled rejection.
  const pubClient = redis.duplicate({ commandTimeout: undefined, maxRetriesPerRequest: null });
  const subClient = pubClient.duplicate();
  for (const client of [pubClient, subClient]) {
    client.on("error", (err) => logger.warn({ err }, "Socket.IO Redis client error"));
  }

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    },
    adapter: createAdapter(pubClient, subClient),
  });

  io.on("connection", (socket) => {
    logger.debug({ socketId: socket.id }, "Socket connected");
    socket.on("disconnect", (reason) => {
      logger.debug({ socketId: socket.id, reason }, "Socket disconnected");
    });
  });

  const server = httpServer.listen(env.PORT, () => {
    logger.info(`Novak API server running at http://localhost:${env.PORT} in ${env.NODE_ENV} mode`);
  });

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);

    const forceTimer = setTimeout(() => {
      logger.error("Graceful shutdown timeout exceeded (10s). Forcing exit.");
      process.exit(1);
    }, 10000);
    forceTimer.unref();

    server.close(async () => {
      logger.info("HTTP server closed");
      try {
        io.close();
        await Promise.allSettled([pubClient.quit(), subClient.quit()]);
        await disconnectRedis();
        await disconnectDB();
        logger.info("All connections closed. Exiting process.");
        process.exit(0);
      } catch (err) {
        logger.error({ err }, "Error during graceful shutdown");
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "Failed to bootstrap Novak API");
  process.exit(1);
});
