import { expect, test } from "@playwright/test";

/**
 * Full free-tier story pipeline against a running Next.js app.
 * Burns Gemini/IONOS quota — intentional. Needs `npm run dev` + API keys.
 */

test.describe("KI story generation", () => {
  test.setTimeout(10 * 60 * 1000);

  test("generates story HTML and learned list on /kostenlos", async ({
    page,
  }) => {
    await page.goto("/kostenlos");

    await expect(
      page.getByRole("heading", {
        name: "Wähl dein Thema. Wir schreiben deine Geschichte.",
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Magie & Geheimnisse" }).click();
    await page.getByRole("button", { name: "3. Klasse" }).click();
    await page.getByRole("button", { name: "Spannend" }).click();

    // Bot guard: min fill time 2s on story-generate.
    await page.waitForTimeout(2500);

    await page.getByRole("button", { name: "Meine Geschichte starten" }).click();

    await expect(
      page.getByRole("heading", { name: "Deine Geschichte entsteht" }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("heading", { name: "Deine Geschichte entsteht" }),
    ).toBeHidden({ timeout: 9 * 60 * 1000 });

    const storyRegion = page.getByRole("region", { name: "Deine Geschichte" });
    await expect(storyRegion).toBeVisible({ timeout: 30_000 });
    await expect(storyRegion.locator("h1")).toBeVisible();
    await expect(storyRegion.locator(".story-html")).not.toBeEmpty();

    await expect(
      page.getByRole("heading", { name: "Das hast du gelernt" }),
    ).toBeVisible();

    const learnedItems = page.locator(
      "section[aria-labelledby='learned-facts-heading'] li",
    );
    await expect(learnedItems.first()).toBeVisible();
    expect(await learnedItems.count()).toBeGreaterThan(0);

    await expect(
      page.getByRole("button", { name: "Als PDF speichern" }),
    ).toBeVisible();

    await expect(page.getByText("Deine Auswahl")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Auswahl ändern" }),
    ).toBeVisible();
  });
});
