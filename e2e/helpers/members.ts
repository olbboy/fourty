import { expect, type Browser, type Page } from "@playwright/test";

/** A teammate who accepted an invite: what they sign in with. */
export type Teammate = { name: string; email: string; password: string };

/**
 * Invite a fresh teammate from the admin's Settings page and have them accept
 * in a browser of their own. Unique per call, so specs never share people.
 */
export async function inviteAndJoin(page: Page, browser: Browser, label: string): Promise<Teammate> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const mate = { name: `E2E ${label} ${stamp}`, email: `e2e-${label}-${stamp}@fourty.test`, password: `${label}-password-123` };
  await page.goto("/settings");
  const members = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Team members" }) });
  await members.getByRole("textbox", { name: "Email address to invite" }).fill(mate.email);
  await members.getByRole("combobox", { name: "Role for the invitee" }).selectOption("member");
  await members.getByRole("button", { name: "Invite", exact: true }).click();
  const link = (await members.locator("code").first().innerText()).trim();

  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(link);
    await guestPage.getByLabel("Your name").fill(mate.name);
    await guestPage.getByLabel("Choose a password").fill(mate.password);
    await guestPage.getByRole("button", { name: "Create account and join" }).click();
    await expect(guestPage).toHaveURL(/\/dashboard/);
  } finally {
    await guest.close();
  }
  return mate;
}

/** Sign a teammate in on a fresh browser that reports the given user agent. */
export async function signInAs(browser: Browser, mate: Teammate, userAgent?: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, ...(userAgent ? { userAgent } : {}) });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(mate.email);
  await page.getByLabel("Password").fill(mate.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return { context, page };
}
