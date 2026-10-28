import { expect, test } from "@playwright/test";

test("3 sheets in a 2x2 binder = 24 slots, spreads, blocked shrink, size slider", async ({ page }) => {
  await page.goto("/binders");
  await page.getByPlaceholder("e.g. Vintage holos").fill("Sheet Test Binder");
  await page.getByLabel("Pocket type").selectOption("2x2");
  await page.getByLabel("Sheets", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Create binder" }).click();

  await expect(page.locator(".current-binder-name")).toHaveText("Sheet Test Binder");
  await expect(page.locator(".current-binder-meta")).toContainText("3 sheets");
  await expect(page.locator(".current-binder-meta")).toContainText("24 pockets filled".replace(" pockets filled", ""));

  // Spread 1: Page 1 alone (4 pockets).
  await expect(page.locator(".spread-wrap .binder-page")).toHaveCount(1);
  await expect(page.locator(".pocket")).toHaveCount(4);

  // Spread 2: Pages 2-3 side by side (8 pockets).
  await page.getByText("Pages 2–3").click();
  await expect(page.locator(".spread-wrap .binder-page")).toHaveCount(2);
  await expect(page.locator(".pocket")).toHaveCount(8);

  // Put a card on Page 6 (the last spread, shown solo), then shrinking must be blocked.
  const tabs = page.locator(".page-tab");
  await tabs.last().click();
  await expect(page.locator(".spread-wrap .binder-page")).toHaveCount(1);
  const lastSpreadPockets = page.locator(".spread-wrap .binder-page").last().locator(".pocket");
  await lastSpreadPockets.first().click();
  const editor = page.locator(".editor-sidebar");
  await editor.getByRole("tab", { name: "New" }).click();
  await editor.getByPlaceholder("Card name").fill("Blocker Card");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".spread-wrap")).toContainText(/Blocker Card/i);

  const sheetsInput = page.getByLabel("Sheet count");
  await sheetsInput.fill("2");
  await sheetsInput.press("Enter");
  await expect(page.locator(".sheet-notice")).toContainText(/still has cards/);
  await expect(page.locator(".current-binder-meta")).toContainText("3 sheets");

  // Page-size slider changes the spread scale and persists.
  const slider = page.getByLabel("Page size");
  await slider.fill("70");
  await expect(page.locator(".spread-wrap")).toHaveCSS("--binder-scale", "0.7");
  await page.reload();
  await expect(page.getByLabel("Page size")).toHaveValue("70");

  // Clean up: return size to 100 for other specs and leave planner on 9-pocket binder.
  await page.getByLabel("Page size").fill("100");
  await page.getByRole("button", { name: "Binders", exact: true }).click();
  await page.getByRole("button", { name: "Manage Binders" }).click();
  const nine = page.locator(".binder-card", { has: page.getByRole("heading", { name: "9-Pocket Binder", exact: true }) });
  if (!(await nine.evaluate((el) => el.classList.contains("current")))) {
    await nine.getByRole("button", { name: "Select & open" }).click();
  } else {
    await page.getByRole("button", { name: "Planner", exact: true }).click();
  }
  await expect(page.getByText("All changes saved")).toBeVisible();
});
