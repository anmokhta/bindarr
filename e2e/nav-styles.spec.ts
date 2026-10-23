import { expect, test } from "@playwright/test";

test("nav styles live under Settings and demos are clickable", async ({ page }) => {
  await page.goto("/settings?tab=nav-styles");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const settingsNav = page.getByRole("navigation", { name: "Settings sections" });
  await expect(settingsNav.getByRole("button", { name: "Nav styles" })).toHaveClass(/active/);
  // Calls is last.
  await expect(settingsNav.getByRole("button").nth(2)).toHaveText("Calls");

  const picker = page.getByLabel("Subsection nav");
  await picker.selectOption("segment");
  await expect(picker).toHaveValue("segment");

  for (const title of ["Segmented control", "Sidebar / inset list", "Icon + label rail"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }

  const firstSegment = page.locator(".nav-demo-card").first().locator(".nav-demo-segment").first();
  await firstSegment.getByRole("tab", { name: "Wishlist" }).click();
  await expect(firstSegment.getByRole("tab", { name: "Wishlist" })).toHaveAttribute("aria-selected", "true");
  await expect(firstSegment.getByRole("tab", { name: "Cards" })).toHaveAttribute("aria-selected", "false");

  const sidebarCard = page.locator(".nav-demo-card").filter({ has: page.getByRole("heading", { name: "Sidebar / inset list" }) });
  await sidebarCard.getByRole("button", { name: "Use in app" }).click();
  await expect(picker).toHaveValue("sidebar");
  await expect(settingsNav).toHaveClass(/nav-style-sidebar/);

  await page.goto("/extras/nav-styles");
  await expect(page).toHaveURL(/\/settings\?tab=nav-styles$/);
});
