import { expect, test } from "@playwright/test";

/**
 * Guest smoke tests for marketing + free composer surfaces.
 * Does not burn AI quota (no story generation submit).
 *
 * Note: `/basis` and `/paket1`–`/paket3` are legacy redirects → `/geschichte`
 * (auth-gated). Guest trial composer lives at `/kostenlos`.
 */

test.describe("Landing (guest)", () => {
  test("home loads with brand and middle marketing nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "leseno" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Seitenbereiche" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Seitenbereiche" }).getByRole("link", {
        name: "So geht’s",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Anmelden" })).toBeVisible();
  });

  test("hero CTA reaches free trial composer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Kostenlos eigene Geschichte starten" }).first().click();
    await expect(page).toHaveURL(/\/kostenlos/);
  });

  test("pricing CTA reaches register", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Jetzt mit Basis starten" }).first().click();
    await expect(page).toHaveURL(/\/registrieren/);
  });

  test("secondary hero CTA reaches register", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Konto anlegen" }).first().click();
    await expect(page).toHaveURL(/\/registrieren/);
  });
});

test.describe("Kostenlos trial (guest)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/kostenlos");
  });

  test("composer shows themes and limited school stages", async ({ page }) => {
    await expect(
      page.getByRole("heading", {
        name: /Eine Geschichte — ohne Konto/i,
      }),
    ).toBeVisible();

    await expect(page.getByRole("button", { name: "Tiere" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dinos" })).toBeVisible();

    await expect(page.getByRole("button", { name: "1. Klasse" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Vorschule" })).toBeDisabled();
  });

  test("school stage and mood choices are interactive", async ({ page }) => {
    await page.getByRole("button", { name: "1. Klasse" }).click();
    await page.getByRole("button", { name: "Lustig" }).click();
    await expect(
      page.getByRole("button", { name: "Meine Geschichte starten" }),
    ).toBeEnabled();
  });
});

test.describe("Auth pages", () => {
  test("sign-in form renders", async ({ page }) => {
    await page.goto("/anmelden");
    await expect(page.getByRole("heading", { name: /Anmelden/i })).toBeVisible();
    await expect(page.locator('input[name="identifier"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("meine-welt redirects guests toward auth", async ({ page }) => {
    await page.goto("/meine-welt");
    await expect(page).toHaveURL(/\/anmelden/);
    await expect(page.locator('input[name="identifier"]')).toBeVisible();
  });
});

test.describe("Admin gate", () => {
  test("guest hitting /admin/users is sent to sign-in", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/anmelden/);
  });
});

test.describe("Spiele hub (guest)", () => {
  test("hub lists four games", async ({ page }) => {
    await page.goto("/spiele");
    await expect(page.getByRole("heading", { name: "Spiele" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tier-Memory/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Bibliothek-Escape/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Bauwelt/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sternenlauf/i })).toBeVisible();
  });

  test("memory loads client game", async ({ page }) => {
    await page.goto("/spiele/memory");
    await expect(
      page.getByRole("heading", { name: "Tier-Memory" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Neu mischen" })).toBeVisible();
  });
});

test.describe("Robustness smoke", () => {
  test("unknown route returns branded 404", async ({ page }) => {
    const response = await page.goto("/diese-seite-gibt-es-nicht-xyz");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "leseno" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Diese Seite gibt’s hier nicht." }),
    ).toBeVisible();
  });

  test("kostenlos responds within budget", async ({ page }) => {
    const started = Date.now();
    const response = await page.goto("/kostenlos");
    const elapsed = Date.now() - started;
    expect(response?.ok()).toBeTruthy();
    expect(elapsed).toBeLessThan(8_000);
  });

  test("legacy /basis redirects toward geschichte", async ({ page }) => {
    await page.goto("/basis");
    // Playwright follows redirects; guest → /anmelden, session → /geschichte.
    await expect(page).toHaveURL(/\/(geschichte|anmelden)/);
  });
});
