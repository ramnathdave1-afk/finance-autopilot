import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@fa/ui": path.resolve(__dirname, "../../packages/ui/src")
    }
  }
});
