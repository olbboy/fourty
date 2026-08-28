import { describe, expect, it } from "vitest";
import { inviteEmail } from "@/lib/mail-templates";

const base = {
  workspaceName: "Acme",
  role: "member",
  acceptUrl: "https://crm.example.com/accept?token=ws1.secret",
  expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
};

describe("invite email", () => {
  it("puts the accept link in both parts", () => {
    const msg = inviteEmail(base);
    expect(msg.text).toContain(base.acceptUrl);
    expect(msg.html).toContain(base.acceptUrl);
  });

  it("names the inviter in the subject when there is one", () => {
    expect(inviteEmail({ ...base, inviterName: "Ada" }).subject).toBe(
      "Ada invited you to Acme on Fourty",
    );
    expect(inviteEmail(base).subject).toBe("You've been invited to Acme on Fourty");
  });

  it("rounds the expiry to whole days, never below one", () => {
    expect(inviteEmail(base).text).toContain("expires in 7 days");
    // An invite in its last hour still reads sensibly rather than "0 days".
    expect(inviteEmail({ ...base, expiresAt: Date.now() + 60_000 }).text).toContain(
      "expires in 1 day",
    );
  });

  it("escapes names so they cannot inject markup into the HTML part", () => {
    // A workspace named with a tag would otherwise smuggle a second link into
    // an email that appears to come from Fourty.
    const msg = inviteEmail({
      ...base,
      workspaceName: '<a href="https://evil.test">Acme</a>',
      inviterName: "<script>x</script>",
    });
    expect(msg.html).not.toContain("<a href=\"https://evil.test\">");
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;script&gt;");
    // The plain-text part is not markup, so it keeps the raw characters.
    expect(msg.text).toContain("<script>x</script>");
  });
});
