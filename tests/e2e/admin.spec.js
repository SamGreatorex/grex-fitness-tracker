import { expect, test } from "@playwright/test";
import { account, expectPath, signedInAs } from "./accounts";

// Test plan section 6, as the Admin. Role changes and deleting users
// change other accounts, so they're left to the manual plan.

test.describe("Admin", () => {
  signedInAs("admin");

  test("6.1 admin home links to the library and users", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Users/ }).click();
    await expectPath(page, "/admin/users");
    await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  });

  test("6.2 search finds yourself and nothing for a made-up name", async ({ page }) => {
    await page.goto("/admin/users");
    const search = page.getByPlaceholder("Search by name or email");

    await search.fill(account("admin").email);
    await expect(page.getByText("You", { exact: true })).toBeVisible();

    await search.fill("zz-no-such-user-zz");
    await expect(page.getByText("No users match.")).toBeVisible();
  });

  test("6.9 you can't delete yourself", async ({ page }) => {
    await page.goto("/admin/users");
    await page.getByPlaceholder("Search by name or email").fill(account("admin").email);
    await expect(page.getByText("You", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete user" })).toHaveCount(0);
  });

  test("6.11 exercise library opens the new exercise form", async ({ page }) => {
    await page.goto("/admin/exercises");
    await expect(page.getByRole("heading", { name: "Exercise library" })).toBeVisible();
    await page.getByRole("button", { name: /New exercise/ }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.getByRole("heading", { name: "New exercise" })).toBeVisible();
    await expect(dialog.getByLabel("Name")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
  });
});
