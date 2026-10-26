import { expect, test } from "@playwright/test";
import { expectPath, signedInAs } from "./accounts";

// Test plan 5.1, 6.1, 7.1, 7.2, 3.18 — what each role can reach.

async function modeOptions(page) {
  await page.getByRole("button", { name: "Switch mode" }).click();
  await expect(page.getByRole("option").first()).toBeVisible();
  // Each option is a ✓ (selected one only) then its label.
  const options = await page.locator('[role="option"] > span:last-child').allInnerTexts();
  await page.keyboard.press("Escape");
  return options.map((o) => o.trim());
}

test.describe("Basic user", () => {
  signedInAs("basic");

  test("7.1 has no mode switcher", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch mode" })).toHaveCount(0);
  });

  test("7.1 is sent home from Trainer mode", async ({ page }) => {
    await page.goto("/trainer");
    await expectPath(page, "/");
  });

  test("7.1 is sent home from Admin mode", async ({ page }) => {
    await page.goto("/admin/users");
    await expectPath(page, "/");
  });

  test("account menu offers Plan & billing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Plan & billing" })).toBeVisible();
  });
});

test.describe("PT", () => {
  signedInAs("pt");

  test("5.1 can switch between User and Trainer mode only", async ({ page }) => {
    await page.goto("/");
    expect(await modeOptions(page)).toEqual(["User mode", "Trainer mode"]);
  });

  test("5.1 switching mode opens Trainer home", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Switch mode" }).click();
    await page.getByRole("option", { name: "Trainer mode" }).click();
    await expectPath(page, "/trainer");
    await expect(page.getByRole("heading", { name: "Trainer", exact: true })).toBeVisible();
  });

  test("7.2 is sent home from Admin mode", async ({ page }) => {
    await page.goto("/admin");
    await expectPath(page, "/");
  });

  test("3.18 needs no plan", async ({ page }) => {
    await page.goto("/subscribe");
    await expect(page.getByRole("heading", { name: "No plan needed" })).toBeVisible();
  });

  test("3.18 account menu has no Plan & billing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Profile settings" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Plan & billing" })).toHaveCount(0);
  });
});

test.describe("Admin", () => {
  signedInAs("admin");

  test("6.1 can switch to User, Trainer and Admin mode", async ({ page }) => {
    await page.goto("/");
    expect(await modeOptions(page)).toEqual(["User mode", "Trainer mode", "Admin mode"]);
  });

  test("6.1 can open Trainer mode", async ({ page }) => {
    await page.goto("/trainer");
    await expect(page.getByRole("heading", { name: "Trainer", exact: true })).toBeVisible();
  });

  test("3.18 needs no plan", async ({ page }) => {
    await page.goto("/subscribe");
    await expect(page.getByRole("heading", { name: "No plan needed" })).toBeVisible();
  });
});
