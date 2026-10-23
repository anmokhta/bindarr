import { expect, test } from "@playwright/test";

test("nav styles live under Settings and demos are clickable", async ({ page }) => {
  await page.goto("/settings?tab=nav-styles");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Nav styles" })).toHaveClass(/active/);

  for (const title of [
    "1. Current pills (baseline)",
    "2. Nested underline",
    "3. Segmented control",
    "4. Sidebar / inset list",
    "5. Breadcrumb + page title",
    "6. Dropdown in title row",
    "7. Icon + label rail",
  ]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }

  const firstPills = page.locator(".nav-demo-card").first().locator(".nav-demo-pills").first();
  await firstPills.getByRole("tab", { name: "Wishlist" }).click();
  await expect(firstPills.getByRole("tab", { name: "Wishlist" })).toHaveAttribute("aria-selected", "true");
  await expect(firstPills.getByRole("tab", { name: "Cards" })).toHaveAttribute("aria-selected", "false");

  // Legacy Extras URL redirects into Settings.
  await page.goto("/extras/nav-styles");
  await expect(page).toHaveURL(/\/settings\?tab=nav-styles$/);
});
