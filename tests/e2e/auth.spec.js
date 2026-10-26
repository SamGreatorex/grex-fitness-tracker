import { expect, test } from "@playwright/test";
import { account, expectPath, hasAccount, signIn } from "./accounts";

// Test plan section 2 — the parts that don't need an emailed code.
// Signed-out tests: no saved session.

test.describe("sign-in page", () => {
  test("shows the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });

  test("2.1 sign-up tab offers the free trial by default", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up & start free trial" })).toBeVisible();
    await expect(page.getByText("No card needed. You'll pick a monthly plan when the trial ends.")).toBeVisible();
  });

  test("2.8 wrong password shows an error and stays on sign-in", async ({ page }) => {
    test.skip(!hasAccount("basic"), "Needs the basic account's email");
    await signIn(page, { email: account("basic").email, password: "WrongPassword1" });
    await expect(page.getByText(/incorrect username or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("2.10 forgot password opens the reset form and goes back", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset code" })).toBeVisible();
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});

test.describe("2.17 protected pages when signed out", () => {
  test("/ sends you to sign in", async ({ page }) => {
    await page.goto("/");
    await expectPath(page, "/login");
    await expect(page).not.toHaveURL(/redirect=/);
  });

  for (const path of ["/reports", "/measurements", "/settings", "/trainer", "/admin", "/reports/weight?range=year"]) {
    test(`${path} sends you to sign in, set to come back`, async ({ page }) => {
      await page.goto(path);
      await expectPath(page, "/login");
      expect(new URL(page.url()).searchParams.get("redirect")).toBe(path);
    });
  }

  test("signing in takes you back to the page you asked for", async ({ page }) => {
    test.skip(!hasAccount("basic"), "Needs the basic account");
    await page.goto("/reports");
    await expectPath(page, "/login");
    const { email, password } = account("basic");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await expectPath(page, "/reports");
  });

  test("a redirect to another site is ignored", async ({ page }) => {
    test.skip(!hasAccount("basic"), "Needs the basic account");
    await signIn(page, account("basic"), "//example.com");
    await expectPath(page, "/");
  });
});

test.describe("2.7 sign in and out", () => {
  test.skip(!hasAccount("basic"), "Needs the basic account");

  test("signs in, then signs out from the account menu", async ({ page }) => {
    await signIn(page, account("basic"));
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.goto("/reports");
    await expectPath(page, "/login");
  });
});
