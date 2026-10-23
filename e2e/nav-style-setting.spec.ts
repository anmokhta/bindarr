import { expect, test } from "@playwright/test";

test("settings subsection nav switches between segment, sidebar, and icons", async ({ page }) => {
  await page.goto("/settings");
  const picker = page.getByLabel("Subsection nav");
  await expect(picker).toHaveValue("segment");

  const settingsNav = page.getByRole("navigation", { name: "Settings sections" });
  await expect(settingsNav).toHaveClass(/nav-style-segment/);

  await picker.selectOption("sidebar");
  await expect(settingsNav).toHaveClass(/nav-style-sidebar/);

  await picker.selectOption("icons");
  await expect(settingsNav).toHaveClass(/nav-style-icons/);
  await expect(settingsNav.getByRole("button", { name: "General" }).locator("svg")).toBeVisible();

  await page.goto("/bank/cards");
  await expect(page.getByRole("navigation", { name: "Section" })).toHaveClass(/nav-style-icons/);
});
