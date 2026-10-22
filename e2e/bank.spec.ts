import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/lookup**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        cards: [
          {
            id: "base1-58",
            name: "Pikachu",
            number: "58",
            setName: "Base",
            imageSmall: "https://images.pokemontcg.io/base1/58.png",
            artist: "Mitsuhiro Arita",
            evolvesFrom: null,
            evolvesTo: ["Raichu"],
          },
        ],
        cached: false,
      }),
    });
  });
});

test("add to bank from New tab, place from Bank tab and from Bank page", async ({ page }) => {
  await page.goto("/");

  // Pocket 1: create via lookup in the New tab, also saving to the bank.
  await page.locator(".pocket").nth(0).click();
  const editor = page.locator(".editor-sidebar");
  await expect(editor.getByRole("tab", { name: "Bank" })).toBeVisible();
  await expect(editor.getByRole("tab", { name: "New" })).toBeVisible();
  await editor.getByPlaceholder("Card name").fill("Pikachu");
  await editor.getByRole("button", { name: "Look up" }).click();
  await editor.getByRole("button", { name: /Pikachu — Base #58/ }).click();
  await expect(editor.getByLabel(/Also save to bank/)).toBeChecked();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".pocket .card-overlay-name").first()).toHaveText(/pikachu/i);

  // Pocket 2: place the same card from the editor's Bank tab.
  await page.locator(".pocket").nth(1).click();
  await editor.getByRole("tab", { name: "Bank" }).click();
  await editor.locator(".bank-picker-item").first().click();
  await editor.getByRole("button", { name: /Fill this pocket with Pikachu/ }).click();
  await expect(page.locator(".pocket .card-overlay-name").nth(1)).toHaveText(/pikachu/i);

  // Bank page shows the card; Place mode fills pocket 3.
  await page.getByRole("button", { name: "Bank", exact: true }).click();
  await expect(page.locator(".bank-card")).toHaveCount(1);
  await expect(page.locator(".bank-card")).toContainText("Pikachu");
  await page.locator(".bank-card").getByRole("button", { name: "Place" }).click();
  await expect(page.getByText(/Placing/)).toBeVisible();
  await page.locator(".pocket").nth(2).click();
  await expect(page.locator(".pocket .card-overlay-name").nth(2)).toHaveText(/pikachu/i);

  // Everything persists across reload.
  await page.reload();
  await expect(page.locator(".pocket .card-overlay-name")).toHaveCount(3);
  await page.getByRole("button", { name: "Bank", exact: true }).click();
  await expect(page.locator(".bank-card")).toHaveCount(1);
});
