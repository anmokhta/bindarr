import { expect, test } from "@playwright/test";

test("wishlist card is grayscale in a pocket, then joins the bank when obtained", async ({ page }) => {
  await page.goto("/wishlist");
  await expect(page.getByRole("heading", { name: "Wishlist" })).toBeVisible();

  await page.getByRole("button", { name: "+ Add wanted card" }).click();
  const form = page.locator(".bank-item-form");
  await form.getByPlaceholder("Name *").fill("Charizard Wish");
  await form.getByPlaceholder("Set", { exact: true }).fill("Base");
  await form.getByPlaceholder("Number").fill("4");
  await form.getByPlaceholder("Artist").fill("Mitsuhiro Arita");
  await form.getByPlaceholder("Image URL").fill("https://images.pokemontcg.io/base1/4.png");
  await expect(form.getByLabel("I want it")).toBeChecked();
  await form.getByRole("button", { name: "Save to bank" }).click();
  await expect(page.locator(".bank-card")).toHaveCount(1);

  // Place it, then check the pocket renders grayscale.
  await page.locator(".bank-card").getByRole("button", { name: "Place" }).click();
  await page.locator(".pocket").first().click();
  const pocket = page.locator(".pocket").first();
  await expect(pocket).toHaveClass(/wishlist-only/);
  const filter = await pocket.locator(".card-full").evaluate((el) => getComputedStyle(el).filter);
  expect(filter).toContain("grayscale");

  // Mark obtained from the wishlist: leaves wishlist, appears in bank, pocket turns color.
  await page.getByRole("button", { name: "Bank", exact: true }).click();
  await page.getByRole("button", { name: "Wishlist", exact: true }).click();
  await page.locator(".bank-card").getByRole("button", { name: "Mark obtained" }).click();
  await expect(page.locator(".bank-card")).toHaveCount(0);

  await page.getByRole("button", { name: "Bank", exact: true }).click();
  await expect(page.locator(".bank-card", { hasText: "Charizard Wish" })).toHaveCount(1);

  await page.getByRole("button", { name: "Binders", exact: true }).click();
  await expect(page.locator(".pocket").first()).not.toHaveClass(/wishlist-only/);
});

test("export downloads JSON containing have/want flags", async ({ page }) => {
  await page.goto("/bank");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("bank");
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const items = JSON.parse(await readFile(path!, "utf8")) as { have: boolean; want: boolean }[];
  expect(items.length).toBeGreaterThan(0);
  expect(items[0]).toHaveProperty("have");
  expect(items[0]).toHaveProperty("want");
});

test("routing: deep links, standalone settings, gear returns to previous page", async ({ page }) => {
  await page.goto("/bank");
  await expect(page).toHaveURL(/\/bank\/cards$/);
  await expect(page.locator(".collection-sidebar")).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator(".settings-back")).toBeVisible();
  await expect(page.locator(".main-nav")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Bindarr" })).toHaveCount(0);

  // Gear again returns to /bank.
  await page.locator(".settings-heading-row").getByRole("button", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/bank\/cards$/);

  // Fresh load of /settings (no stored previous route): back goes home.
  await page.goto("/settings");
  await page.evaluate(() => sessionStorage.removeItem("bindarr-prev-route"));
  await page.goto("/settings");
  await page.locator(".settings-back").click();
  await expect(page).toHaveURL(/\/binders\/planner$/);
});

test("artist search scaffold deep-links and prefills from a card", async ({ page }) => {
  await page.goto("/bank");
  const artistBtn = page.locator(".bank-card").getByRole("button", { name: /More by this artist/ }).first();
  await artistBtn.click();
  await expect(page).toHaveURL(/\/artist-search\?artist=/);
  await expect(page.getByPlaceholder(/Artist name/)).not.toHaveValue("");
  await expect(page.getByRole("link", { name: "Open on The Art of Pokémon" })).toHaveAttribute(
    "href",
    /artofpkm\.com\/illustrators\//,
  );
  await expect(page.getByText(/coming soon|results will appear/i).first()).toBeVisible();
});
