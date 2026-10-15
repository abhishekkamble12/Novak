import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Inside Docker the API is reachable as http://api:3000, not localhost
const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:3000";

// https://vitejs.dev/config/
export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
      "/socket.io": {
        target: proxyTarget,
        ws: true,
      },
    },
  },
});
