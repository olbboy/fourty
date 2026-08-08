import { test, expect } from "@playwright/test";

/**
 * Suggestions from the evidence ledger, on the record page (ADR-018).
 *
 * The unit tests prove the invariants in the transaction. This proves the part
 * they cannot: that a suggestion reaches the field it is about, that Accept
 * writes the value the rep can then see, and that Dismiss takes it away and
 * keeps it away. The whole safety story is worth nothing if the two buttons are
 * wired to the wrong ids.
 *
 * The fact is seeded through the API using the browser's own session, so the
 * spec exercises the real REST route rather than reaching into the database.
 */
const SIGNATURE = {
  kind: "crm.signature-block",
  detail: "their signature on 14 July reads Head of Operations",
};

test("a suggestion lands under its field, accepts into the record, and dismisses for good", async ({
  page,
}) => {
  // A contact of our own, so no demo record is left modified.
  await page.goto("/contacts");
  const created = await page.request.post("/api/contacts", {
    data: { firstName: "Ledger", lastName: "Marchetti", email: "ledger@fernhill.test" },
  });
  expect(created.ok()).toBe(true);
  const contactId = (await created.json()).contact.id as string;

  const propose = async (value: string) =>
    page.request.post("/api/facts", {
      data: {
        entityType: "contact",
        entityId: contactId,
        field: "job_title",
        value,
        evidence: [SIGNATURE],
      },
    });

  expect((await propose("Head of Operations")).ok()).toBe(true);
  await page.goto(`/contacts/${contactId}`);

  // The rationale is what a rep reads — the score is not the argument.
  await expect(page.getByText(SIGNATURE.detail)).toBeVisible();
  await page.getByRole("button", { name: "Accept Head of Operations" }).click();
  const jobTitle = page.locator("div", { has: page.getByText("Job title", { exact: true }) });
  await expect(jobTitle.getByText("Head of Operations").first()).toBeVisible();

  // A second, different claim about the same field is now a proposal against a
  // value a human accepted, and dismissing it must be permanent.
  expect((await propose("Chief of Staff")).ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Dismiss Chief of Staff permanently" }).click();
  await expect(page.getByRole("button", { name: "Dismiss Chief of Staff permanently" })).toHaveCount(0);

  // Re-offering it is refused by the ledger, not merely hidden by the UI.
  const again = await propose("Chief of Staff");
  expect((await again.json()).result.ok).toBe(false);
  await page.reload();
  await expect(page.getByRole("button", { name: "Accept Chief of Staff" })).toHaveCount(0);

  await page.request.delete(`/api/contacts/${contactId}`);
});
