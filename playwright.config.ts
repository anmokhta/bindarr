import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:18080" },
  webServer: {
    command:
      "npm run build && rm -f /tmp/bindarr-e2e.db /tmp/bindarr-e2e.db-shm /tmp/bindarr-e2e.db-wal && DATABASE_PATH=/tmp/bindarr-e2e.db PORT=18080 npm start",
    url: "http://127.0.0.1:18080/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
