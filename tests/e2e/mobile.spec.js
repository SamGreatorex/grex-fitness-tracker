import { expect, test } from "@playwright/test";
import { signedInAs } from "./accounts";

// Test plan 7.7 — runs only in the "mobile" project (a Pixel 7 screen).
// Main pages shouldn't need sideways scrolling.

test.describe("Phone layout", () => {
  signedInAs("basic");

  for (const path of ["/", "/programs/new", "/measurements", "/reports", "/billing", "/settings"]) {
    test(`${path} fits the screen width`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "page is wider than the screen").toBeLessThanOrEqual(1);
    });
  }
});
