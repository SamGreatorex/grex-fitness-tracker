import { expect, test } from "@playwright/test";
import { expectPath, signedInAs } from "./accounts";

// Test plan section 5, as the PT. Client-specific tests (taking on and
// releasing clients, client programmes) change other accounts, so they're
// left to the manual plan; templates are self-contained, so they're
// created and deleted here.

test.describe("Trainer home", () => {
  signedInAs("pt");

  test("5.2 lists clients and available users", async ({ page }) => {
    await page.goto("/trainer");
    await expect(page.getByRole("heading", { name: "Trainer", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^My clients/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Available/ })).toBeVisible();
    await expect(page.getByText("Users without a PT.", { exact: false })).toBeVisible();
  });

  test("5.3 search narrows both lists", async ({ page }) => {
    await page.goto("/trainer");
    await expect(page.getByRole("heading", { name: /^My clients \(\d+\)/ })).toBeVisible();
    await page.getByPlaceholder("Search by name or email").fill("zz-no-such-person-zz");
    // Each list says nothing matches (or that it was empty to begin with).
    await expect(page.getByText(/No clients match\.|No clients yet/)).toBeVisible();
    await expect(page.getByText(/No users match\.|Everyone has a PT right now\./)).toBeVisible();
  });

  test("5.14 templates page opens", async ({ page }) => {
    await page.goto("/trainer");
    await page.getByRole("link", { name: "Programme templates" }).click();
    await expect(page.getByRole("heading", { name: "Programme templates" })).toBeVisible();
  });
});

test.describe("5.9 / 5.14 template with a start weight in lb", () => {
  signedInAs("pt");

  test("creates, reopens and deletes a template, keeping the lb start weight", async ({ page }) => {
    const name = `E2E template ${Date.now()}`;

    await page.goto("/trainer/templates/new");
    await expect(page.getByRole("heading", { name: "New template" })).toBeVisible();
    await page.getByLabel("Programme name").fill(name);

    // Add the first strength exercise from the library.
    await page.getByRole("button", { name: "+ Add exercises" }).click();
    const picker = page.locator("dialog[open]");
    await picker.locator("li button").filter({ hasNotText: "Cardio" }).first().click();
    await picker.getByRole("button", { name: "Done" }).click();
    await expect(picker).toHaveCount(0);

    // Switch the start weight to lb and enter 100.
    const units = page.getByRole("group", { name: /^Start weight unit for / }).first();
    const lb = units.getByRole("button", { name: "lb", exact: true });
    const kg = units.getByRole("button", { name: "kg", exact: true });
    await expect(kg).toHaveAttribute("aria-pressed", "true");
    await lb.click();
    await expect(lb).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel(/start weight in lb$/).first().fill("100");

    // Switching unit relabels the number rather than converting it.
    await kg.click();
    await expect(page.getByLabel(/start weight in kg$/).first()).toHaveValue("100");
    await lb.click();
    await expect(page.getByLabel(/start weight in lb$/).first()).toHaveValue("100");

    await page.getByRole("button", { name: "Create template" }).click();
    await expectPath(page, "/trainer/templates");

    // Reopen: still lb, still 100.
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page.getByRole("heading", { name: "Edit template" })).toBeVisible();
    const reopened = page.getByRole("group", { name: /^Start weight unit for / }).first();
    await expect(reopened.getByRole("button", { name: "lb", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel(/start weight in lb$/).first()).toHaveValue("100");

    // Clean up.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete template" }).click();
    await expectPath(page, "/trainer/templates");
    await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  });
});

test.describe("5.18 messages", () => {
  signedInAs("pt");

  test("messages page opens", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  });
});
