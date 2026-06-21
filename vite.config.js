import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// User site (dpxrk.github.io) → served from domain root, so base "/".
// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
