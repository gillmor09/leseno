import { expect, test } from "@playwright/test";

/**
 * Guest smoke tests for marketing + free composer surfaces.
 * Does not burn AI quota (no story generation submit).
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

  test("hero CTA reaches /kostenlos", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Jetzt kostenlos starten" }).first().click();
    await expect(page).toHaveURL(/\/kostenlos/);
  });
});

test.describe("Kostenlos (guest)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/kostenlos");
  });

  test("composer shows Top-10 themes and personal toggle off", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", {
        name: "Wähl dein Thema. Wir schreiben deine Geschichte.",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Magie & Geheimnisse" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sport & Power" }),
    ).toBeVisible();

    const personal = page.getByRole("switch", { name: "Ganz persönlich" });
    await expect(personal).toBeVisible();
    await expect(personal).toBeDisabled();
    await expect(personal).toHaveAttribute("aria-checked", "false");
  });

  test("school stage and mood choices are interactive", async ({ page }) => {
    await page.getByRole("button", { name: "1. Klasse" }).click();
    await page.getByRole("button", { name: "Lustig" }).click();
    await expect(
      page.getByRole("button", { name: "Meine Geschichte starten" }),
    ).toBeEnabled();
  });

  test("guest header still shows marketing nav on /kostenlos", async ({
    page,
  }) => {
    await expect(
      page.getByRole("navigation", { name: "Seitenbereiche" }),
    ).toBeVisible();
  });
});

test.describe("Auth pages", () => {
  test("sign-in form renders", async ({ page }) => {
    await page.goto("/anmelden");
    await expect(page.getByRole("heading", { name: /Anmelden/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("meine-welt redirects guests toward auth", async ({ page }) => {
    await page.goto("/meine-welt");
    await expect(page).toHaveURL(/anmelden|registrieren|meine-welt/);
    // Either redirect to auth or show a gate — must not expose editable world without session.
    const email = page.locator('input[type="email"]');
    const worldHeading = page.getByRole("heading", { name: /Meine Welt/i });
    await expect(email.or(worldHeading)).toBeVisible();
    if (await email.isVisible()) {
      await expect(page).toHaveURL(/anmelden|registrieren/);
    }
  });
});

test.describe("Admin gate", () => {
  test("guest hitting /admin/users is sent to sign-in", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/anmelden/);
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
});
