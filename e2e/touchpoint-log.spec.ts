import { test, expect } from "@playwright/test";

/**
 * Phase 19: a call is logged with what was said and how long it took, and the
 * timeline shows both.
 */
test("a call is logged with its length and what was said", async ({ page }) => {
  const stamp = Date.now();
  const res = await page.request.post("/api/contacts", { data: { firstName: "Gọi", lastName: `${stamp}` } });
  const contact = ((await res.json()) as { contact: { id: string } }).contact;

  await page.goto(`/contacts/${contact.id}`);
  await page.getByRole("button", { name: "Call", exact: true }).click();
  const form = page.getByRole("form", { name: "Log call" });
  await form.getByRole("spinbutton", { name: "How long, in minutes" }).fill("15");
  await form.getByRole("textbox", { name: "What was said" }).fill(`Hỏi giá pin ${stamp}`);
  await form.getByRole("button", { name: "Log it" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("tabpanel").getByText(`logged a call (15 min) — Hỏi giá pin ${stamp}`)).toBeVisible();
});
