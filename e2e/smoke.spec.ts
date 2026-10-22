import { expect, test } from "@playwright/test";

test("planner loads, edits a pocket in the sidebar, renames a page, and persists", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bindarr", exact: true })).toBeVisible();
  await expect(page.getByText(/Card management and binder organizing/)).toBeVisible();
  await expect(page.locator(".pocket")).toHaveCount(9);

  // Edit opens a sidebar (desktop) / sheet, not an in-pocket form.
  await page.locator(".pocket").first().click();
  const editor = page.locator(".editor-sidebar");
  await expect(editor).toBeVisible();
  await expect(editor.getByText(/Add card|Edit pocket/)).toBeVisible();
  await editor.getByPlaceholder("Card name").fill("Pikachu");
  await editor.getByPlaceholder("Note (set, condition...)").fill("Base Set #58");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".pocket").first()).toContainText(/Pikachu/i);
  await expect(page.getByText("All changes saved")).toBeVisible();

  // Inline page rename (double-click), as in the original single-file app.
  await page.locator(".page-tab").first().dblclick();
  const rename = page.locator(".page-tab input");
  await rename.fill("Favorites");
  await rename.press("Enter");
  await expect(page.locator(".page-tab").first()).toHaveText("Favorites");
  await expect(page.getByText("All changes saved")).toBeVisible();

  // Survives reload (server-side persistence).
  await page.reload();
  await expect(page.locator(".pocket").first()).toContainText(/Pikachu/i);
  await expect(page.locator(".page-tab").first()).toHaveText("Favorites");

  // Switching binders via the Binders page gives each binder its own pages.
  await expect(page.locator(".current-binder-name")).toHaveText("9-Pocket Binder");
  await page.getByRole("button", { name: "Binders", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Binders" })).toBeVisible();
  await expect(page.getByText("Create a new binder")).toBeVisible();
  await page.locator(".binder-card", { has: page.getByRole("heading", { name: "4-Pocket Binder", exact: true }) })
    .getByRole("button", { name: "Select & open" }).click();
  await expect(page.locator(".pocket")).toHaveCount(4);
  await expect(page.locator(".current-binder-name")).toHaveText("4-Pocket Binder");

  await page.getByRole("button", { name: "Bank", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Card Bank" })).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(/Connected · bindarr/)).toBeVisible();
});
