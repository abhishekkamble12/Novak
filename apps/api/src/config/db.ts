import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "./logger.js";

// Register database lifecycle listeners once globally
mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB connection disconnected");
});

mongoose.connection.on("reconnected", () => {
  logger.info("MongoDB connection reconnected");
});

mongoose.connection.on("error", (err) => {
  logger.error({ err }, "MongoDB encountered a connection error");
});

export async function connectDB(): Promise<void> {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(env.MONGO_URI, {
      dbName: env.MONGO_DB_NAME,
      maxPoolSize: 50,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info({ dbName: env.MONGO_DB_NAME }, "Connected to MongoDB database successfully");
  } catch (error) {
    logger.error({ err: error }, "MongoDB initial connection failed. Scheduling retry in 5s...");
    setTimeout(connectDB, 5000);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected gracefully");
}
