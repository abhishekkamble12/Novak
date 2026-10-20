import net from "node:net";

function reachable(url: string, fallbackPort: number): Promise<boolean> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port: Number(port) || fallbackPort, timeout: 1500 });
    socket.once("connect", () => (socket.end(), resolve(true)));
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
  });
}

export default async function () {
  const mongo = process.env.TEST_MONGO_URI ?? "mongodb://127.0.0.1:27017";
  const redis = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15";
  const missing = [];
  if (!(await reachable(mongo, 27017))) missing.push(`MongoDB (${mongo})`);
  if (!(await reachable(redis, 6379))) missing.push(`Redis (${redis})`);
  if (missing.length) {
    throw new Error(
      `Integration tests need ${missing.join(" and ")}. Start them with "npm run infra:up" ` +
        "or set TEST_MONGO_URI / TEST_REDIS_URL."
    );
  }
}
