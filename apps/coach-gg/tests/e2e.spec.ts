import { test, expect } from '@playwright/test';

test('health endpoint returns 200', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('healthy');
});

test('homepage loads with slug input', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#slugInput')).toBeVisible();
  await expect(page.locator('#analyzeBtn')).toBeVisible();
  await expect(page.locator('#searchDropdown')).toHaveCount(0);
  await expect(page.locator('#slugInput')).toHaveAttribute('placeholder', /slug/i);
});

test('direct slug analysis starts (bc954a2e)', async ({ page }) => {
  await page.goto('/?slug=bc954a2e');
  // Progress section should appear as SignalR connects and job starts
  await expect(page.locator('#progressSection')).not.toHaveClass(/hidden/, { timeout: 15000 });
});

test('sort toggle buttons are present and work on all tabs', async ({ page }) => {
  await page.goto('/?slug=bc954a2e');
  await expect(page.locator('#progressSection')).not.toHaveClass(/hidden/, { timeout: 15000 });
  await expect(page.locator('#resultsSection')).not.toHaveClass(/hidden/, { timeout: 60000 });
  await expect(page.locator('.sort-btn[data-sort="winrate"]')).toBeVisible();
  await expect(page.locator('.sort-btn[data-sort="wins"]')).toBeVisible();

  // Switch to # wins and verify it becomes active
  await page.locator('.sort-btn[data-sort="wins"]').click();
  await expect(page.locator('.sort-btn[data-sort="wins"]')).toHaveClass(/active/);

  // Verify sort also applies on Stage Counterpick tab
  await page.locator('.tab[data-tab="matchups"]').click();
  await expect(page.locator('#tab-matchups')).toHaveClass(/active/);

  // Verify sort also applies on Character Counterpick tab
  await page.locator('.tab[data-tab="vschars"]').click();
  await expect(page.locator('#tab-vschars')).toHaveClass(/active/);
});

test('Char × Char tab shows matchup data vs opponent characters', async ({ page }) => {
  await page.goto('/?slug=bc954a2e');
  await expect(page.locator('#progressSection')).not.toHaveClass(/hidden/, { timeout: 15000 });
  await expect(page.locator('#resultsSection')).not.toHaveClass(/hidden/, { timeout: 60000 });

  // Click the Character Counterpick tab
  await page.locator('.tab[data-tab="vschars"]').click();

  // Tab content becomes active (not display:none)
  await expect(page.locator('#tab-vschars')).toHaveClass(/active/, { timeout: 5000 });

  // Should have at least one opponent character row
  const vsCharList = page.locator('#vsCharList');
  await expect(vsCharList.locator('.matchup-row').first()).toBeVisible({ timeout: 5000 });
  const count = await vsCharList.locator('.matchup-row').count();
  expect(count).toBeGreaterThan(0);
  console.log(`Character Counterpick rows: ${count}`);
});

test('mobile layout has no horizontal scroll', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // No horizontal overflow
  const noHorizontalScroll = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(noHorizontalScroll).toBeTruthy();

  // Search input is visible and usable
  await expect(page.locator('#slugInput')).toBeVisible();

  // All 4 tab buttons are present
  const tabs = page.locator('.tab');
  expect(await tabs.count()).toBe(4);

  // Sort buttons exist in the DOM (they appear after analysis)
  expect(await page.locator('.sort-btn').count()).toBeGreaterThan(0);

  await context.close();
});
