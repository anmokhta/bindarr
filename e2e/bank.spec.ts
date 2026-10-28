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
  await expect(editor.getByText(/Saving creates a bank card/i)).toBeVisible();
  await expect(editor.getByLabel(/Also add to bank/)).toHaveCount(0);
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

test("bank filter multi-select narrows and clears", async ({ page }) => {
  await page.goto("/bank/cards");

  // Seed two cards with different artists via the API-backed UI is heavy; use lookup from planner then bank.
  await page.goto("/");
  await page.route("**/api/lookup**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        cards: [
          {
            id: "sv3-1",
            name: "Eevee",
            number: "173",
            setName: "SVP",
            imageSmall: "https://images.pokemontcg.io/svp/173.png",
            artist: "Makura Tami",
            evolvesFrom: null,
            evolvesTo: [],
          },
        ],
        cached: false,
      }),
    });
  });

  // Add second card (Eevee) to bank from an empty pocket.
  await page.locator(".pocket").nth(3).click();
  const editor = page.locator(".editor-sidebar");
  await editor.getByPlaceholder("Card name").fill("Eevee");
  await editor.getByRole("button", { name: "Look up" }).click();
  await editor.getByRole("button", { name: /Eevee — SVP #173/ }).click();
  await expect(editor.getByLabel(/Also add to bank/)).toHaveCount(0);
  await editor.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByRole("button", { name: "Bank", exact: true }).click();
  await expect(page.locator(".bank-card")).toHaveCount(2);

  await page.getByRole("button", { name: "Artists" }).click();
  const panel = page.locator(".multi-select-panel");
  await expect(panel).toBeVisible();
  await panel.getByLabel("Makura Tami").check();
  await expect(page.locator(".bank-card")).toHaveCount(1);
  await expect(page.locator(".bank-card")).toContainText("Eevee");

  await panel.getByRole("button", { name: "Clear" }).click();
  await expect(page.locator(".bank-card")).toHaveCount(2);
});
