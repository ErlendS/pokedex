import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm build && VERSUS_POKEMON_ID=25 PORT=4173 pnpm start",
    port: 4173,
    reuseExistingServer: false,
  },
});
