import { defineConfig } from "@playwright/test";
const base = process.env.BASE_PATH || "/";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:4173${base}`,
    headless: true,
    hasTouch: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: `http://127.0.0.1:4173${base}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "webkit-mobile",
      testMatch: ["mobile-state.spec.js", "theme.spec.js"],
      use: { browserName: "webkit", isMobile: true, hasTouch: true },
    },
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...(process.platform === "win32" ? { channel: "msedge" } : {}),
      },
    },
  ],
});
