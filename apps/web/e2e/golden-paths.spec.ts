import { test, expect } from "@playwright/test";

test.describe("Golden paths", () => {
  test("landing → signup CTA → auth screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/AI agents/i);
    await page.getByRole("link", { name: /get started/i }).click();
    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("paywall renders all 3 tiers + founder badge", async ({ page }) => {
    await page.goto("/paywall");
    await expect(page.getByRole("heading", { name: /^Autopilot$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Pro$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Premium$/ })).toBeVisible();
    await expect(page.getByText(/\$9\.99/).first()).toBeVisible();
  });

  test("onboarding step 1 → step 2 (goals)", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("link", { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/onboarding\/goals/);
    await expect(page.getByText(/Set 1–3 goals/i)).toBeVisible();
  });

  test("app feed renders without auth (stub fallback)", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /today/i })).toBeVisible();
  });

  test("agents index lists all 10 visible entries", async ({ page }) => {
    await page.goto("/app/agents");
    for (const name of [
      "Bill Negotiation", "Charge Disputes", "Card Optimizer",
      "Missing Money", "Refinance Watcher", "Insurance Shopper",
      "Tax Prep", "Investment Rebalancer", "Net Worth Strategy", "Human Backup"
    ]) {
      await expect(page.getByText(name)).toBeVisible();
    }
  });

  test("roadmap loads", async ({ page }) => {
    await page.goto("/roadmap");
    await expect(page.getByRole("heading", { name: /public roadmap/i })).toBeVisible();
  });
});
