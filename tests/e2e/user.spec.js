import { expect, test } from "@playwright/test";
import { signedInAs } from "./accounts";

// Test plan sections 2–4 for a Basic user on an active plan: the pages
// load and show the right things. Logging workouts changes the account's
// history, so that's left to the manual plan.

test.describe("Basic user pages", () => {
  signedInAs("basic");

  test("4.1 home lists your programmes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your programs" })).toBeVisible();
  });

  test("2.13 settings shows the account and profile form", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Password", exact: true })).toBeVisible();
    await expect(page.getByText("Account type")).toBeVisible();
  });

  test("3.3 billing shows the plan and test-mode note", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "Plan & billing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
    await expect(page.getByText("Test mode — payments are simulated and no money is taken.")).toBeVisible();
  });

  test("4.22 body measurements page loads", async ({ page }) => {
    await page.goto("/measurements");
    await expect(page.getByRole("heading", { name: "Body measurements" })).toBeVisible();
  });

  test("4.23 reports load", async ({ page }) => {
    for (const path of ["/reports", "/reports/workouts", "/reports/weight", "/reports/measurements"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  test("4.2 / 3.7 new programme shows the builder, or the limit message when at the limit", async ({ page }) => {
    await page.goto("/programs/new");
    await expect(page.getByRole("heading", { name: "New programme" })).toBeVisible();
    await expect(page.getByLabel("Programme name").or(page.getByText(/which is your plan's limit/))).toBeVisible();
  });
});
