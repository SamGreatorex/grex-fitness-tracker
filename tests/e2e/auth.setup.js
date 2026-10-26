import { expect, test as setup } from "@playwright/test";
import { ROLES, account, authFile, hasAccount, signIn } from "./accounts";

// Signs in once as each configured role and saves the session (Amplify
// keeps its tokens in localStorage), so the other tests start signed in.
for (const role of ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    setup.skip(!hasAccount(role), `No ${role} account configured`);
    await signIn(page, account(role));
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    // The header's account menu shows once the profile has loaded.
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await page.context().storageState({ path: authFile(role) });
  });
}
