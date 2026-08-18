import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === "true" ? "/NflFantasyDraftHelper/" : "/",
  test: {
    environment: "node",
    testTimeout: 20_000,
  },
});
