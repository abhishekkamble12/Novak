import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { redis, disconnectRedis } from "./config/redis.js";

async function bootstrap() {
  // Connect Databases
  await connectDB();

  const app = createApp();
  const httpServer = http.createServer(app);

  // Setup Socket.IO with Redis pub/sub adapter
  const pubClient = redis;
  const subClient = redis.duplicate();

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
    logger.info(`Lumen API server running at http://localhost:${env.PORT} in ${env.NODE_ENV} mode`);
  });

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);

    server.close(async () => {
      logger.info("HTTP server closed");

      try {
        io.close();
        await disconnectRedis();
        await disconnectDB();
        logger.info("All connections closed. Exiting process.");
        process.exit(0);
      } catch (err) {
        logger.error({ err }, "Error during graceful shutdown");
        process.exit(1);
      }
    });

    // Force exit after 10s timeout
    setTimeout(() => {
      logger.error("Graceful shutdown timeout exceeded. Forcing exit.");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "Failed to bootstrap Lumen API");
  process.exit(1);
});
