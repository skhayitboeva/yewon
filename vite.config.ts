import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // `npm run dev` uses `netlify dev`, which proxies /api itself.
    // `npm run dev:vite` alone needs this to reach a separately running netlify dev.
    proxy: {
      "/api": { target: "http://localhost:8888", changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
