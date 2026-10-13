import { test, expect } from "@playwright/test";
import { inviteAndJoin, signInAs } from "./helpers/members";

const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1";

/** Phase 10: a member sees the devices they are signed in on and ends one. */
test("a member sees their signed-in devices and signs the phone out", async ({ page, browser }) => {
  const mate = await inviteAndJoin(page, browser, "sessions");
  const laptop = await signInAs(browser, mate, MAC_CHROME);
  const phone = await signInAs(browser, mate, IPHONE_SAFARI);
  try {
    await laptop.page.getByRole("button", { name: "Account menu" }).click();
    await laptop.page.getByRole("menuitem", { name: "My account" }).click();
    const dialog = laptop.page.getByRole("dialog");
    await expect(dialog.getByText("Chrome · macOS")).toBeVisible();
    await expect(dialog.getByText("this device")).toBeVisible();
    await dialog.getByRole("button", { name: "Sign out Safari · iPhone" }).click();
    await expect(dialog.getByText("Safari · iPhone")).toHaveCount(0);

    // The phone is out: its next request is no longer signed in.
    expect((await phone.page.request.get("/api/me/sessions")).status()).toBe(401);
  } finally {
    await laptop.context.close();
    await phone.context.close();
  }
});
