const { test, expect } = require("@playwright/test");

const sampleStats = {
  totals: {
    total: 123456,
    auto: 120000,
    manual: 3456,
  },
};

function stubStats(page) {
  return page.route("**/api/stats", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sampleStats),
    });
  });
}

function stubTelemetry(page) {
  return page.route("**/api/telemetry", (route) => {
    route.fulfill({ status: 200, body: "{}" });
  });
}

test("loads the challenge page and shows commitment", async ({ page }) => {
  await stubStats(page);
  await stubTelemetry(page);
  await page.goto("/");

  await expect(page.locator(".hero .kicker")).toHaveText("Asymmetric Challenge");
  await expect(
    page.getByRole("heading", { name: "Guess the 256-bit key. Win $100." })
  ).toBeVisible();

  const commitment = page.locator(".hash-block");
  await expect(commitment).toBeVisible();
  await expect(commitment).toContainText(/^[0-9a-f]{64}$/);

  await expect(page.getByText("Global attempts")).toBeVisible();
  await expect(page.getByText("123,456")).toBeVisible();
});

test("random guess button fills input and attempts", async ({ page }) => {
  await stubStats(page);
  await stubTelemetry(page);
  await page.goto("/");

  const input = page.locator("input.input-field");
  const randomBtn = page.getByRole("button", { name: "Random Guess" });
  await expect(input).toHaveValue(/^[0-9a-f]{64}$/);

  await randomBtn.click();
  await expect(input).toHaveValue(/^[0-9a-f]{64}$/);

  const status = page.locator(".status").first();
  await expect(status).toContainText(/Nope|Awaiting|Challenge/);

  const manualCard = page.getByText("Manual attempts").locator("..");
  await expect(manualCard).toContainText(/1|2|3|4|5/);
});

test("invalid input shows validation error", async ({ page }) => {
  await stubStats(page);
  await stubTelemetry(page);
  await page.goto("/");

  const input = page.locator("input.input-field");
  await input.fill("abc123");
  await page.getByRole("button", { name: "Check Guess" }).click();

  await expect(page.getByText("Enter exactly 64 hex characters.")).toBeVisible();
});

test("recent guesses list updates", async ({ page }) => {
  await stubStats(page);
  await stubTelemetry(page);
  await page.goto("/");

  const input = page.locator("input.input-field");
  await input.fill("f".repeat(64));
  await page.getByRole("button", { name: "Check Guess" }).click();

  await expect(page.getByText("Last 5 tried keys")).toBeVisible();
  await expect(page.getByText("f".repeat(64))).toBeVisible();
});

test("toggle switches aria-pressed", async ({ page }) => {
  await stubStats(page);
  await stubTelemetry(page);
  await page.goto("/");

  const toggle = page.locator("button.toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});
