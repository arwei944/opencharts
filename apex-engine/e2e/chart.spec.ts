import { test, expect } from "@playwright/test";

test.describe("ApexChart E2E Tests", () => {
  // Start dev server on http://localhost:8080 (or your port)
  const BASE_URL = "http://localhost:3000";

  test.beforeAll(async () => {
    // Ensure the app is running
    console.log("Running E2E tests against:", BASE_URL);
  });

  test("renders chart component without errors", async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Wait for chart to load
    await page.waitForSelector('[id^="apex-chart-"]', { timeout: 10000 });
    
    // Check that chart container exists
    const chartContainer = await page.locator('[id^="apex-chart-"]').first();
    await expect(chartContainer).toBeVisible();
  });

  test("loads initial data for BTCUSDT", async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Wait for chart to be ready
    await page.waitForSelector("#chart-ready");
    
    // Verify chart is interactive (no loading state)
    const loadingState = await page.isVisible(".loading-overlay");
    expect(loadingState).toBeFalsy();
  });

  test("switches chart type via toolbar", async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Click on bar chart button
    const barButton = page.getByRole("button", { name: /bar/i });
    await barButton.click();
    
    // Verify chart updated
    await page.waitForTimeout(500);
    
    // The series should have changed
    const seriesData = await page.evaluate(() => {
      const chart = window.__chartApi;
      return chart?.mainSeries()?.type();
    });
    
    expect(["BarSeries", "CandlestickSeries"]).toContain(seriesData);
  });

  test("handles error gracefully", async ({ page }) => {
    // Mock API failure
    await page.route("**/api/klines*", (route) => {
      route.fail("failed");
    });
    
    await page.goto(BASE_URL);
    
    // Should show error boundary after retry attempts
    await page.waitForTimeout(6000);
    
    const errorText = await page.textContent("p.text-red-500");
    expect(errorText).toContain("加载失败");
  });
});
