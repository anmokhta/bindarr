import { expect, test } from "@playwright/test";

test("two-level task bar, legacy redirects, and taxonomy skeletons", async ({ page }) => {
  // Legacy URLs land on canonical routes.
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/bank\/wishlist$/);
  await page.goto("/artist-search?artist=Mitsuhiro%20Arita");
  await expect(page).toHaveURL(/\/extras\/artist-search\?artist=/);
  await expect(page.getByPlaceholder(/Artist name/)).toHaveValue("Mitsuhiro Arita");

  // Primary + subsection active states.
  const main = page.getByRole("navigation", { name: "Main" });
  await expect(main.getByRole("button", { name: "Extras" })).toHaveClass(/active/);
  await main.getByRole("button", { name: "Bank" }).click();
  await expect(page).toHaveURL(/\/bank\/cards$/);
  const section = page.getByRole("navigation", { name: "Section" });
  await expect(section.getByRole("button", { name: "Cards" })).toHaveClass(/active/);

  await section.getByRole("button", { name: "Bulk add" }).click();
  await expect(page).toHaveURL(/\/bank\/bulk-add$/);
  await expect(page.getByRole("heading", { name: "Bulk add" })).toBeVisible();
  await expect(page.getByLabel("Card list")).toBeVisible();

  // Tags skeleton reflects seeded bank data (Pikachu/Charizard from other specs may exist).
  await section.getByRole("button", { name: "Tags" }).click();
  await expect(page).toHaveURL(/\/bank\/tags$/);
  await expect(page.getByRole("heading", { name: /Tags/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New tag" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Preview matches" })).toBeDisabled();

  await section.getByRole("button", { name: "Collections" }).click();
  await expect(page).toHaveURL(/\/bank\/collections$/);
  await expect(page.getByRole("heading", { name: /Collections/ })).toBeVisible();
  await expect(page.getByText(/single-value|one collection/)).toBeVisible();

  // Binders section: Manage -> Planner.
  await main.getByRole("button", { name: "Binders" }).click();
  await expect(page).toHaveURL(/\/binders\/planner$/);
  await page.getByRole("navigation", { name: "Section" }).getByRole("button", { name: "Manage Binders" }).click();
  await expect(page).toHaveURL(/\/binders\/manage$/);
  await expect(page.getByRole("heading", { name: "Binders" })).toBeVisible();
});
