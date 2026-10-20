import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load root .env first, fallback to local .env. On Railway/Docker the files don't exist
// and variables come from the platform environment.
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const DEV_ACCESS_SECRET = "development-access-secret-32-chars-long";
const DEV_REFRESH_SECRET = "development-refresh-secret-32-chars-long";
const DEV_INTERNAL_SECRET = "internal-ai-service-shared-secret-key";

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Railway injects PORT; locally it defaults to 3000
    PORT: z.coerce.number().default(3000),
    // Reverse proxies in front of the API, so req.ip (and rate limiting) sees the real client.
    // 1 = Railway's edge or local nginx. 2 = Vercel rewrite -> Railway edge.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),

    MONGO_URI: z.string().default("mongodb://localhost:27017/novak"),
    // Railway's MongoDB plugin URL has no database path, so name it explicitly
    MONGO_DB_NAME: z.string().default("novak"),
    REDIS_URL: z.string().default("redis://localhost:6379"),

    JWT_ACCESS_SECRET: z.string().default(DEV_ACCESS_SECRET),
    JWT_REFRESH_SECRET: z.string().default(DEV_REFRESH_SECRET),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

    // Comma-separated. Supports a single "*" wildcard in the host, e.g. https://novak-*.vercel.app
    CORS_ORIGIN: z.string().default("http://localhost,http://localhost:5173,http://localhost:3000"),
    // "lax" when the web app reaches the API through the same origin (Vercel rewrite / nginx);
    // "none" when the browser calls the API cross-site directly (requires HTTPS).
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    COOKIE_SECURE: booleanString.optional(),

    AI_SERVICE_URL: z.string().default("http://localhost:8000"),
    INTERNAL_API_SECRET: z.string().default(DEV_INTERNAL_SECRET),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().default(60000),
    // Run the BullMQ post-analysis worker (and the pending-post reconciler) in this process
    ENABLE_WORKER: booleanString.default("true"),
    // How often the reconciler runs, and how old a pending post must be before it's checked
    RECONCILE_INTERVAL_MS: z.coerce.number().int().min(1000).default(60000),
    RECONCILE_STALE_MS: z.coerce.number().int().min(0).default(60000),
    // Per-IP limits backed by Redis. Disable only for local load tests.
    RATE_LIMIT_ENABLED: booleanString.default("true"),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== "production") return;
    const requireSecret = (key: keyof typeof data, devDefault: string) => {
      const value = data[key] as string;
      // Also rejects the placeholders shipped in .env.example
      if (value === devDefault || value.length < 32 || /change-me|development|internal-ai-service/i.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} must be set to a random value of at least 32 characters in production`,
          path: [key],
        });
      }
    };
    requireSecret("JWT_ACCESS_SECRET", DEV_ACCESS_SECRET);
    requireSecret("JWT_REFRESH_SECRET", DEV_REFRESH_SECRET);
    requireSecret("INTERNAL_API_SECRET", DEV_INTERNAL_SECRET);
    if (data.COOKIE_SAMESITE === "none" && data.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "COOKIE_SAMESITE=none requires COOKIE_SECURE=true",
        path: ["COOKIE_SECURE"],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  COOKIE_SECURE: parsed.data.COOKIE_SECURE ?? parsed.data.NODE_ENV === "production",
};
