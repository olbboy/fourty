import { test, expect, type Locator, type Page } from "@playwright/test";
import { ADMIN } from "./helpers/auth";

/**
 * Settings — the SSO, mailbox and diagnostics panels, driven through the browser.
 *
 * These panels are the only interface to features that were API-only until
 * recently, and their unit coverage stops at "renders without crashing". Every
 * assertion here is about the round trip: the form reaches the API, the API's
 * answer reaches the list, and the destructive paths actually destroy.
 *
 * Both panels are also the sole reason a stale `enabled` integer or a swallowed
 * 403 would go unnoticed, so the state-toggle paths are covered rather than just
 * create/delete.
 *
 * The specs clean up after themselves (each ends by deleting what it made) so the
 * suite can run repeatedly against a database the setup wizard only truncates
 * once, and so neither spec depends on the other's leftovers.
 */

/**
 * Row deletions go through the in-app confirmation, not `window.confirm`, so
 * this drives a real dialog: click the row control, then confirm inside it.
 *
 * `page.on("dialog")` would not see this one — that is the point of the change,
 * and this helper is what proves the replacement is wired up rather than merely
 * present.
 */
async function confirmDeletion(page: Page, control: Locator, action = "Delete"): Promise<void> {
  await control.click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: action, exact: true }).click();
  await expect(confirmation).toBeHidden();
}

test.describe("SSO providers", () => {
  const LABEL = "E2E Okta";

  test("adds, edits, disables and deletes an OIDC provider", async ({ page }) => {
    await page.goto("/settings");

    const panel = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Single sign-on" }) });
    await expect(panel).toBeVisible();

    // ── Add ──────────────────────────────────────────────────────────────────
    await panel.getByRole("button", { name: "Add provider" }).click();
    const dialog = page.getByRole("dialog", { name: "Add an OIDC provider" });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name (shown on the sign-in button)").fill(LABEL);
    await dialog.getByLabel("Issuer URL").fill("https://idp.e2e.test");
    await dialog.getByLabel("Client ID").fill("e2e-client-id");
    await dialog.getByLabel("Client secret", { exact: true }).fill("e2e-secret");
    await dialog.getByRole("button", { name: "Add provider" }).click();

    const row = panel.getByTestId("sso-connection").filter({ hasText: LABEL });
    await expect(row).toBeVisible();
    // A secret was supplied, so the row must not be flagged as missing one.
    await expect(row).not.toContainText("no client secret set");

    // ── Edit without touching the secret ─────────────────────────────────────
    // The riskiest path in the panel: an empty secret box must mean "keep the
    // current secret", never "clear it". A cleared secret would break every login
    // through this provider, and the only visible trace would be this flag.
    await row.getByRole("button", { name: `Edit ${LABEL}` }).click();
    const editDialog = page.getByRole("dialog", { name: `Edit ${LABEL}` });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByLabel("Issuer URL")).toHaveValue("https://idp.e2e.test");
    await editDialog.getByLabel("Issuer URL").fill("https://idp-renamed.e2e.test");
    await editDialog.getByRole("button", { name: "Save provider" }).click();

    await expect(editDialog).toBeHidden();
    await expect(row).toContainText("idp-renamed.e2e.test");
    await expect(row).not.toContainText("no client secret set");

    // ── Disable / enable ─────────────────────────────────────────────────────
    // `enabled` is an integer in Postgres but a boolean in the update schema, so
    // a broken conversion shows up here as a button that never changes label.
    await row.getByRole("button", { name: "Disable" }).click();
    await expect(row.getByRole("button", { name: "Enable" })).toBeVisible();
    await row.getByRole("button", { name: "Enable" }).click();
    await expect(row.getByRole("button", { name: "Disable" })).toBeVisible();

    // ── Delete ───────────────────────────────────────────────────────────────
    await confirmDeletion(page, row.getByRole("button", { name: `Delete ${LABEL}` }));
    await expect(row).toHaveCount(0);
  });
});

test.describe("Row controls are named", () => {
  /**
   * Every settings panel repeats the same row control down a list, and the
   * destructive one is an icon with no text. The icon is hidden from assistive
   * tech, so without an explicit label these announce as an unnamed button and a
   * screen-reader user gets a column of identical "button, button, button" with
   * no way to tell which record each belongs to.
   *
   * `getByRole(..., { name })` matches the accessible name the browser actually
   * computes, so this fails the moment a label is dropped — which a source scan
   * or a static render could not tell us, since the rows only exist once data
   * has loaded.
   */
  test("members, API keys and custom fields name their per-row controls", async ({ page }) => {
    await page.goto("/settings");

    // ── Members: the admin created by the setup wizard is already a row. ──────
    const members = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Team members" }) });
    await expect(members).toBeVisible();
    // Asserted, never clicked — removing this member would end the session the
    // rest of the suite runs on.
    await expect(members.getByRole("button", { name: `Remove ${ADMIN.name}` })).toBeVisible();
    await expect(members.getByRole("combobox", { name: `Role for ${ADMIN.name}` })).toBeVisible();

    // ── API keys ─────────────────────────────────────────────────────────────
    const keys = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "API keys" }) });
    const keyName = "E2E a11y key";
    await keys.getByPlaceholder("Key name, e.g. Zapier").fill(keyName);
    await keys.getByRole("button", { name: "Generate" }).click();
    const revoke = keys.getByRole("button", { name: `Revoke ${keyName}` });
    await expect(revoke).toBeVisible();
    await confirmDeletion(page, revoke, "Revoke");
    await expect(revoke).toHaveCount(0);

    // ── Custom fields ────────────────────────────────────────────────────────
    const custom = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Custom fields" }) });
    const fieldLabel = "E2E a11y field";
    await custom.getByRole("button", { name: "New field" }).click();
    const dialog = page.getByRole("dialog", { name: "New contact field" });
    // Exact: the key field's label also contains the word "label".
    await dialog.getByLabel("Label", { exact: true }).fill(fieldLabel);
    await dialog.getByRole("button", { name: "Create field" }).click();
    const del = custom.getByRole("button", { name: `Delete ${fieldLabel}` });
    await expect(del).toBeVisible();
    await confirmDeletion(page, del);
    await expect(del).toHaveCount(0);
  });
});

test.describe("Mailboxes", () => {
  const ICS_EMAIL = "e2e-calendar@fourty.test";
  const OAUTH_EMAIL = "e2e-gmail@fourty.test";

  test("adds a calendar feed, pauses it, resumes it and disconnects it", async ({ page }) => {
    await page.goto("/settings");

    const panel = page.locator("[data-slot=card]", {
      has: page.getByRole("heading", { name: "Mailboxes & calendars" }),
    });
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "Add mailbox" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a mailbox or calendar" });
    await dialog.getByLabel("Provider").selectOption("ics");
    // The feed URL field only exists for ICS — its appearance is the proof that
    // the form reacts to the provider choice.
    const feed = dialog.getByLabel("Calendar feed URL");
    await expect(feed).toBeVisible();
    await feed.fill("https://calendar.e2e.test/feed.ics");
    await dialog.getByLabel("Email address").fill(ICS_EMAIL);
    await dialog.getByRole("button", { name: "Add mailbox" }).click();

    const row = panel.getByTestId("mailbox-account").filter({ hasText: ICS_EMAIL });
    await expect(row).toBeVisible();
    await expect(row).toContainText("never synced");

    // The feed URL is a credential (ADR-019): a private calendar URL carries its
    // secret in the path. The row identifies the feed by hostname and the URL
    // itself never comes back over the API.
    await expect(row).toContainText("calendar.e2e.test");
    await expect(row).not.toContainText("/feed.ics");

    // Pause / resume — the PATCH added alongside these panels.
    await row.getByRole("button", { name: "Pause" }).click();
    await expect(row).toContainText("paused");
    await row.getByRole("button", { name: "Resume" }).click();
    await expect(row).not.toContainText("paused");

    await confirmDeletion(page, row.getByRole("button", { name: `Disconnect ${ICS_EMAIL}` }), "Disconnect");
    await expect(row).toHaveCount(0);
  });

  test("offers OAuth connect as a real link, not a fetch", async ({ page }) => {
    // The one regression no unit test can catch. `…/connect` answers with a 302
    // to the provider *and* sets the httpOnly PKCE cookie; a fetch would follow
    // the redirect inside the page and the cookie would never reach the browser,
    // so the callback would later reject the sign-in as forged. Asserting the
    // control is a link is what stops a future tidy-up turning it into a button.
    await page.goto("/settings");
    const panel = page.locator("[data-slot=card]", {
      has: page.getByRole("heading", { name: "Mailboxes & calendars" }),
    });

    await panel.getByRole("button", { name: "Add mailbox" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a mailbox or calendar" });
    await dialog.getByLabel("Provider").selectOption("google");
    await dialog.getByLabel("Email address").fill(OAUTH_EMAIL);
    await dialog.getByRole("button", { name: "Add mailbox" }).click();

    const row = panel.getByTestId("mailbox-account").filter({ hasText: OAUTH_EMAIL });
    await expect(row).toBeVisible();

    const accountId = await row.getAttribute("data-account-id");
    expect(accountId).toBeTruthy();
    // getByRole("link") fails outright if this ever becomes a <button>.
    const connect = row.getByRole("link", { name: "Connect" });
    await expect(connect).toHaveAttribute("href", `/api/sync/accounts/${accountId}/connect`);

    // An unconnected OAuth mailbox has nothing to pull yet, so it offers connect
    // instead of a sync that would only fail.
    await expect(row.getByRole("button", { name: "Sync now" })).toHaveCount(0);

    await confirmDeletion(page, row.getByRole("button", { name: `Disconnect ${OAUTH_EMAIL}` }), "Disconnect");
    await expect(row).toHaveCount(0);
  });
});

test.describe("Diagnostics", () => {
  /**
   * The capability list is read from per-workspace rows, so a wrong probe shows
   * up here as a panel that claims a mailbox nobody connected — and the identity
   * line is a write path with no other interface. Both are invisible to a unit
   * test that stops at "renders without crashing".
   */
  test("lists capabilities and round-trips the identity line", async ({ page }) => {
    await page.goto("/settings");

    const panel = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Diagnostics" }) });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Mailbox sync");
    await expect(panel).toContainText("Custom objects");

    const about = panel.getByLabel(/What .* does/);
    await about.fill("We sell fleet telematics to EU logistics operators.");
    await panel.getByRole("button", { name: "Save" }).click();
    // Save disables itself once the server's answer matches the field — proof the
    // PATCH landed, not just that the button was clicked.
    await expect(panel.getByRole("button", { name: "Save" })).toBeDisabled();

    await page.reload();
    await expect(about).toHaveValue("We sell fleet telematics to EU logistics operators.");

    // Leave the workspace as it was found.
    await about.fill("");
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
