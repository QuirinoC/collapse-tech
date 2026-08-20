const { defineConfig, devices } = require("@playwright/test");

const PORT = 3001;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `SECRET_KEY_HEX=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef npm run build && SECRET_KEY_HEX=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef npm run start -- -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
