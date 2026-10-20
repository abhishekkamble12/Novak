import http from "node:http";
import { createApp, isAllowedOrigin } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { disconnectRedis } from "./config/redis.js";
import { createSocketServer } from "./realtime/socket.js";
import { closePostAnalysis, startPostAnalysisWorker } from "./modules/ai/postAnalysis.queue.js";
import { backfillProcessingStatus } from "./modules/posts/migrations.js";

async function bootstrap() {
  await connectDB();

  const app = createApp();
  const httpServer = http.createServer(app);
  const sockets = createSocketServer(httpServer, isAllowedOrigin);

  if (env.ENABLE_WORKER) {
    startPostAnalysisWorker();
    backfillProcessingStatus().catch((err) => logger.warn({ err }, "Processing-status backfill failed"));
  }

  // Binding without a host listens on "::", i.e. IPv4 and IPv6. Railway's private
  // network is IPv6-only, so this matters there.
  const server = httpServer.listen(env.PORT, () => {
    logger.info(`Novak API listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
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
        await sockets.close();
        await closePostAnalysis();
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

process.on("unhandledRejection", (reason) => {
  // Log loudly but keep serving: one failed background promise shouldn't take the API down
  logger.error({ err: reason }, "Unhandled promise rejection");
});

bootstrap().catch((err) => {
  logger.fatal({ err }, "Failed to bootstrap Novak API");
  process.exit(1);
});
