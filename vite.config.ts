import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The coffee mini-app stays same-origin via a proxy:
//   /service/* -> the coffee-service Go backend (quote, menu, orders, decrypt)
// It is loaded inside the cabinet wallet shell; the bridge talks to the shell
// over postMessage (no /shell proxy needed).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5280,
    proxy: {
      "/service": {
        target: "http://localhost:4100",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/service/, ""),
      },
    },
  },
});
