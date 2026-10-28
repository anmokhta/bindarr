import { expect, test } from "@playwright/test";

test("wishlist card is grayscale in a pocket, then joins the bank when obtained", async ({ page }) => {
  await page.goto("/wishlist");
  await expect(page.getByRole("heading", { name: "Wishlist" })).toBeVisible();

  await page.getByRole("button", { name: "+ Add wanted card" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Add wanted card" })).toBeVisible();
  const form = dialog.locator(".bank-item-form");
  await form.getByLabel("Name *").fill("Charizard Wish");
  await form.getByLabel("Set", { exact: true }).fill("Base");
  await form.getByLabel("Number").fill("4");
  await form.getByLabel("Artist").fill("Mitsuhiro Arita");
  await form.getByLabel("Image URL").fill("https://images.pokemontcg.io/base1/4.png");
  await expect(form.getByRole("button", { name: "I want it" })).toHaveAttribute("aria-pressed", "true");
  await form.getByRole("button", { name: "Save to bank" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".bank-card")).toHaveCount(1);

  // Place it, then check the pocket renders grayscale.
  await page.locator(".bank-card").getByRole("button", { name: "Place" }).click();
  await page.locator(".pocket").first().click();
  const pocket = page.locator(".pocket").first();
  await expect(pocket).toHaveClass(/wishlist-only/);
  const filter = await pocket.locator(".card-full").evaluate((el) => getComputedStyle(el).filter);
  expect(filter).toContain("grayscale");

  // Opening the wishlist pocket shows Details (not New) and no "add to bank" checkbox.
  await page.getByRole("button", { name: "Binders", exact: true }).click();
  await page.locator(".pocket").first().click();
  const editor = page.locator(".editor-sidebar");
  await expect(editor.getByRole("heading", { name: "Edit pocket" })).toBeVisible();
  await expect(editor.getByRole("tab", { name: "Details" })).toBeVisible();
  await expect(editor.getByText(/On wishlist/i)).toBeVisible();
  await expect(editor.getByText(/Save updates the bank; tag is for this pocket only/i)).toBeVisible();
  await expect(editor.getByLabel(/Also add to bank/)).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Mark obtained" })).toBeVisible();
  await editor.getByRole("button", { name: "Close editor" }).click();

  // Mark obtained from the wishlist: leaves wishlist, appears in bank, pocket turns color.
  await page.getByRole("button", { name: "Bank", exact: true }).click();
  await page.getByRole("button", { name: "Wishlist", exact: true }).click();
  await page.locator(".bank-card").getByRole("button", { name: "Mark obtained" }).click();
  await expect(page.locator(".bank-card")).toHaveCount(0);

  await page.getByRole("button", { name: "Bank", exact: true }).click();
  await expect(page.locator(".bank-card", { hasText: "Charizard Wish" })).toHaveCount(1);

  await page.getByRole("button", { name: "Binders", exact: true }).click();
  await expect(page.locator(".pocket").first()).not.toHaveClass(/wishlist-only/);

  // Linked have pocket: In bank note, no add-to-bank checkbox.
  await page.locator(".pocket").first().click();
  await expect(page.locator(".editor-sidebar").getByText(/In bank/i)).toBeVisible();
  await expect(page.locator(".editor-sidebar").getByText(/Save updates the bank; tag is for this pocket only/i)).toBeVisible();
  await expect(page.locator(".editor-sidebar").getByLabel(/Also add to bank/)).toHaveCount(0);
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

test("artist search deep-links and prefills from a card", async ({ page }) => {
  await page.goto("/bank");
  const artistBtn = page.locator(".bank-card").getByRole("button", { name: /More by / }).first();
  await artistBtn.click();
  await expect(page).toHaveURL(/\/artist-search\?artist=/);
  await expect(page.getByRole("heading", { name: /Artist Search/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Artist Search/ }).locator(".planned-badge")).toHaveText(/Planned/i);
  await expect(page.getByPlaceholder(/Artist name/)).not.toHaveValue("");
  await expect(page.getByRole("link", { name: "Open on The Art of Pokémon" })).toHaveAttribute(
    "href",
    /artofpkm\.com\/illustrators\//,
  );
  // Lookup may succeed (results / status) or show the scaffold note — either means the page loaded.
  await expect(
    page.getByText(/Scaffold only|Searching TCGdex|card|No cards found|Search failed/i).first(),
  ).toBeVisible();
});

test("add card modal opens, Esc closes, Have/Want toggles stay on one line", async ({ page }) => {
  await page.goto("/bank/wishlist");
  await page.getByRole("button", { name: "+ Add wanted card" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const haveBtn = dialog.getByRole("button", { name: "I have it" });
  const wantBtn = dialog.getByRole("button", { name: "I want it" });
  await expect(haveBtn).toBeVisible();
  await expect(wantBtn).toBeVisible();
  const haveBox = await haveBtn.boundingBox();
  const wantBox = await wantBtn.boundingBox();
  expect(haveBox && wantBox).toBeTruthy();
  // Segmented toggle: both chips share a row (same Y, want to the right of have).
  expect(Math.abs((haveBox!.y) - (wantBox!.y))).toBeLessThan(8);
  expect(wantBox!.x).toBeGreaterThan(haveBox!.x);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "+ Add wanted card" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
