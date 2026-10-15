import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load root .env first, fallback to local .env
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3000),
    API_URL: z.string().default("http://localhost:3000"),
    CLIENT_URL: z.string().default("http://localhost:5173"),

    MONGO_URI: z.string().default("mongodb://localhost:27017/lumen"),
    REDIS_URL: z.string().default("redis://localhost:6379"),

    JWT_ACCESS_SECRET: z.string().default("development-access-secret-32-chars-long"),
    JWT_REFRESH_SECRET: z.string().default("development-refresh-secret-32-chars-long"),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

    CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:3000"),

    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    AI_SERVICE_URL: z.string().default("http://localhost:8000"),
    INTERNAL_API_SECRET: z.string().default("internal-ai-service-shared-secret-key"),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (
        data.JWT_ACCESS_SECRET === "development-access-secret-32-chars-long" ||
        data.JWT_ACCESS_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "JWT_ACCESS_SECRET must be configured with at least 32 characters in production",
          path: ["JWT_ACCESS_SECRET"],
        });
      }
      if (
        data.JWT_REFRESH_SECRET === "development-refresh-secret-32-chars-long" ||
        data.JWT_REFRESH_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "JWT_REFRESH_SECRET must be configured with at least 32 characters in production",
          path: ["JWT_REFRESH_SECRET"],
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
