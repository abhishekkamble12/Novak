// Runs before each test file's imports, so src/config/env.ts sees these values.
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.MONGO_URI = process.env.TEST_MONGO_URI ?? "mongodb://127.0.0.1:27017";
// A fresh database per test file; dropped in afterAll
process.env.MONGO_DB_NAME = `novak_test_${crypto.randomBytes(4).toString("hex")}`;
// Redis database 15 keeps test queues apart from a dev worker on database 0
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15";
// Nothing listens here, so semantic search fails fast unless a test starts a stub
process.env.AI_SERVICE_URL = process.env.AI_SERVICE_URL_TEST ?? "http://127.0.0.1:9";
process.env.RATE_LIMIT_ENABLED = "false";
