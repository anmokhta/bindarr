import { expect, test } from "@playwright/test";

test("create a 4x3 binder, current indicator moves, archive/restore/duplicate/delete", async ({ page }) => {
  await page.goto("/binders");

  const currentCard = page.locator(".binder-card.current");
  await expect(currentCard.locator(".current-badge")).toHaveText("Current binder");
  await expect(currentCard.getByRole("button", { name: "Currently open" })).toBeDisabled();

  // Create a 12-pocket binder with 1 sheet (2 sides); it opens in the planner.
  await page.getByPlaceholder("e.g. Vintage holos").fill("Landscape Binder");
  await page.getByLabel("Pocket type").selectOption("4x3");
  await page.getByLabel("Sheets", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Create binder" }).click();
  await expect(page).toHaveURL(/\/binders\/planner$/);
  await expect(page.locator(".current-binder-name")).toHaveText("Landscape Binder");
  await expect(page.locator(".pocket")).toHaveCount(12);
  await expect(page.locator(".page-tab")).toHaveCount(2);

  // Current indicator is on the new binder on /binders.
  await page.getByRole("button", { name: "Binders", exact: true }).click();
  await page.getByRole("button", { name: "Manage Binders" }).click();
  const landscape = page.locator(".binder-card", { hasText: "Landscape Binder" });
  await expect(landscape).toHaveClass(/current/);
  await expect(landscape.locator(".current-badge")).toBeVisible();

  // Rename it inline.
  await landscape.getByRole("button", { name: "Rename" }).click();
  const rename = page.locator(".binder-card.current").getByLabel("Binder name");
  await rename.fill("Big Landscape");
  await rename.press("Enter");
  await expect(page.locator(".binder-card", { has: page.getByRole("heading", { name: "Big Landscape", exact: true }) })).toBeVisible();

  // Duplicate it (copy is not current), then switch current to the copy.
  const big = page.locator(".binder-card", { has: page.getByRole("heading", { name: "Big Landscape", exact: true }) });
  await big.getByRole("button", { name: "Duplicate" }).click();
  const copy = page.locator(".binder-card", { hasText: "Copy of Big Landscape" });
  await expect(copy).toBeVisible();
  await expect(copy).not.toHaveClass(/current/);
  await copy.getByRole("button", { name: "Select & open" }).click();
  await expect(page.locator(".current-binder-name")).toHaveText("Copy of Big Landscape");
  await page.reload();
  await expect(page.locator(".current-binder-name")).toHaveText("Copy of Big Landscape");

  // Back on /binders, the indicator persisted on the copy.
  await page.getByRole("button", { name: "Binders", exact: true }).click();
  await page.getByRole("button", { name: "Manage Binders" }).click();
  await expect(page.locator(".binder-card.current")).toContainText("Copy of Big Landscape");

  // Archive the copy (current moves to another binder), restore, archive again, delete.
  const copyCard = page.locator(".binder-card.current");
  await copyCard.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator(".binder-card.current")).not.toContainText("Copy of Big Landscape");
  const archivedCard = page.locator(".binder-list.archived .binder-card", { hasText: "Copy of Big Landscape" });
  await expect(archivedCard).toBeVisible();
  await archivedCard.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator(".binder-list.archived .binder-card", { hasText: "Copy of Big Landscape" })).toHaveCount(0);
  const restored = page.locator(".binder-card", { has: page.getByRole("heading", { name: "Copy of Big Landscape", exact: true }) });
  await restored.getByRole("button", { name: "Archive" }).click();
  page.once("dialog", (d) => void d.accept());
  await page.locator(".binder-list.archived .binder-card", { hasText: "Copy of Big Landscape" })
    .getByRole("button", { name: "Permanently delete" }).click();
  await expect(page.locator(".binder-card", { hasText: "Copy of Big Landscape" })).toHaveCount(0);

  // Leave the planner on the original 9-pocket binder for other specs.
  const ninePocket = page.locator(".binder-card", { has: page.getByRole("heading", { name: "9-Pocket Binder", exact: true }) });
  if (await ninePocket.evaluate((el) => el.classList.contains("current"))) {
    await page.getByRole("button", { name: "Planner", exact: true }).click();
  } else {
    await ninePocket.getByRole("button", { name: "Select & open" }).click();
  }
  await expect(page.locator(".pocket")).toHaveCount(9);
  await expect(page.getByText("All changes saved")).toBeVisible();
});
