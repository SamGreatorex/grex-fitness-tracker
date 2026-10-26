import path from "node:path";
import { expect, test } from "@playwright/test";

// Test accounts, one per role, from .env.e2e (see tests/README.md).
export const ROLES = ["admin", "pt", "basic", "pro"];

export function account(role) {
  const prefix = `E2E_${role.toUpperCase()}`;
  return { email: process.env[`${prefix}_EMAIL`], password: process.env[`${prefix}_PASSWORD`] };
}

export function hasAccount(role) {
  const { email, password } = account(role);
  return !!(email && password);
}

// Where auth.setup.js saves each role's signed-in session.
export function authFile(role) {
  return path.join(process.cwd(), "tests", "e2e", ".auth", `${role}.json`);
}

// Call at the top of a describe block: signs its tests in as `role`, or
// skips them if that role's account isn't configured.
export function signedInAs(role) {
  test.skip(!hasAccount(role), `Set E2E_${role.toUpperCase()}_EMAIL and _PASSWORD in .env.e2e`);
  test.use({ storageState: authFile(role) });
}

// Fills in and submits the sign-in form on /login (with ?redirect= if given).
export async function signIn(page, { email, password }, redirect) {
  await page.goto(redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  // The tab above the form is also called "Sign in" — use the form's button.
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
}

// Waits for a client-side redirect to land on `pathname`.
export async function expectPath(page, pathname) {
  await page.waitForURL((url) => url.pathname === pathname);
}
