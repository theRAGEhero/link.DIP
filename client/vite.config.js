import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:3100",
      "/previews": "http://localhost:3100",
    },
  },
});
