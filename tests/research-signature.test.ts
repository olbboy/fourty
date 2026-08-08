import { describe, expect, it } from "vitest";
import { extractSignature, SIGNATURE_RAW_MAX, type Sender } from "@/lib/research/signature";

/**
 * Signature extraction, table-driven (Phase 3).
 *
 * The rule this file exists to hold: **a miss costs nothing, a wrong answer
 * lands on a customer record.** So most of these cases assert `null`. A fixture
 * that starts extracting a title from prose is a regression even though it looks
 * like the parser getting cleverer.
 */

const body = (...lines: string[]): string => lines.join("\n");
const sender = (address: string, displayName: string | null = null): Sender => ({ address, displayName });

const ADA = sender("ada@acme.example", "Ada Marchetti");

describe("signature extraction — what it reads", () => {
  it("reads title, employer domain and phone from a delimited block", () => {
    const sig = extractSignature(
      body(
        "Hi Bob,",
        "",
        "Thanks for the update — Thursday works.",
        "",
        "--",
        "Ada Marchetti",
        "Head of Security, Acme",
        "+44 20 7946 0958",
        "www.acme.example",
      ),
      ADA,
    );
    expect(sig).not.toBeNull();
    expect(sig!.title).toBe("Head of Security");
    // The website wins over the name beside the title: only a domain resolves
    // to a company_id, and "Acme" alone does not say which Acme.
    expect(sig!.employer).toBe("acme.example");
    expect(sig!.phone).toBe("+44 20 7946 0958");
    expect(sig!.raw).toContain("Head of Security, Acme");
  });

  it("falls back to the employer name beside the title when there is no website", () => {
    const sig = extractSignature(
      body("Noted.", "", "--", "Jae Kim", "Director of Finance | Fernhill Group", "+1 415 555 0142"),
      sender("jae@fernhill.example", "Jae Kim"),
    );
    expect(sig!.title).toBe("Director of Finance");
    expect(sig!.employer).toBe("Fernhill Group");
  });

  it("reads an undelimited trailing block when it carries the sender's own address", () => {
    const sig = extractSignature(
      body("Sounds good.", "", "Priya Raman", "Principal Engineer, Northwind", "priya@northwind.example"),
      sender("priya@northwind.example", "Priya Raman"),
    );
    expect(sig!.title).toBe("Principal Engineer");
    expect(sig!.employer).toBe("northwind.example");
  });

  it("accepts an undelimited block that names the sender and carries a phone", () => {
    const sig = extractSignature(
      body("Speak soon.", "", "Ada Marchetti", "Head of Security", "+44 20 7946 0958"),
      ADA,
    );
    expect(sig!.title).toBe("Head of Security");
  });

  it("never attributes the other person's signature from a quoted reply", () => {
    const sig = extractSignature(
      body(
        "Agreed, let's do it.",
        "",
        "On Tue, 14 Jul 2026 at 09:12, Bob Vance wrote:",
        "> Happy to help.",
        "> --",
        "> Bob Vance",
        "> Chief Revenue Officer, Vance Refrigeration",
        "> +1 570 555 0101",
        "> vancerefrigeration.example",
      ),
      ADA,
    );
    expect(sig).toBeNull();
  });

  it("caps the stored block", () => {
    const long = "Head of Security, Acme " + "x".repeat(2000);
    const sig = extractSignature(body("Hi.", "", "--", "Ada", long, "+44 20 7946 0958"), ADA);
    expect(sig!.raw.length).toBeLessThanOrEqual(SIGNATURE_RAW_MAX);
  });

  it("ignores a social link when looking for the employer's website", () => {
    const sig = extractSignature(
      body("Ok.", "", "--", "Sam Ortiz", "Product Manager, Lumen", "linkedin.com/in/samortiz", "+34 91 555 0177"),
      sender("sam@lumen.example", "Sam Ortiz"),
    );
    expect(sig!.title).toBe("Product Manager");
    expect(sig!.employer).toBe("Lumen"); // the name, because the only link was social
  });
});

describe("signature extraction — what it refuses", () => {
  const refuses: Array<[string, string]> = [
    ["a mobile footer", body("Yes, fine by me.", "", "Sent from my iPhone")],
    [
      "a legal disclaimer",
      body(
        "Please find it attached.",
        "",
        "--",
        "Dana Lowe",
        "Head of Legal, Acme",
        "This email and any attachments are confidential and may be privileged.",
      ),
    ],
    ["a bare sign-off", body("Hi,", "", "Thanks!", "", "Alice")],
    [
      "a sentence that happens to contain a title word",
      body("Hi Bob,", "", "I'll ask our director about the budget.", "Let me know if that works."),
    ],
    [
      "a closing line that reads like a title",
      body("Hi Bob,", "", "Please contact our account manager", "Thanks"),
    ],
    ["an empty body", ""],
    [
      "a long trailing paragraph",
      body(
        "Hi,",
        "",
        "Line one of a long closing note",
        "Line two",
        "Line three",
        "Line four",
        "Line five",
        "Line six",
        "Line seven from our director",
        "Line eight",
        "Line nine",
      ),
    ],
  ];

  it.each(refuses)("yields nothing for %s", (_name, text) => {
    expect(extractSignature(text, ADA)).toBeNull();
  });

  it("yields nothing rather than a guess when a block has only a name", () => {
    // No phone, no website, no address — ambiguous, so it is left alone even
    // though a looser rule would read "Ada Marchetti / Head of Security".
    expect(extractSignature(body("Ok.", "", "Ada Marchetti", "Head of Security"), ADA)).toBeNull();
  });

  it("does not read a person's name as their job title", () => {
    const sig = extractSignature(body("Ok.", "", "--", "Bradley Leadbetter", "+44 20 7946 0958"), ADA);
    expect(sig!.title).toBeNull();
  });

  /**
   * The worst outcome this module can produce: the sender pastes somebody
   * else's details and Fourty files them under the sender. Everything
   * downstream trusts that a signature describes whoever sent the message.
   */
  describe("somebody else's details at the end of the mail", () => {
    it("refuses a pasted contact card", () => {
      const sig = extractSignature(
        body("Sure, see below for reference.", "", "Jane Doe", "VP of Sales, Acme Inc", "jane@customer.example"),
        ADA,
      );
      expect(sig).toBeNull();
    });

    it("refuses a hard-wrapped closing line naming a third party", () => {
      const sig = extractSignature(
        body(
          "Hi team,",
          "",
          "Please loop in Jane Doe, our VP of",
          "Sales, at jane@customer.example for",
          "questions on pricing.",
        ),
        ADA,
      );
      expect(sig).toBeNull();
    });

    it("refuses even a delimited block when the only address in it is not the sender's", () => {
      const sig = extractSignature(
        body("Forwarding.", "", "--", "Jane Doe", "VP of Sales, Acme", "jane@customer.example"),
        ADA,
      );
      expect(sig).toBeNull();
    });

    it("refuses an undelimited block that names nobody we know", () => {
      const sig = extractSignature(
        body("Ok.", "", "Jane Doe", "VP of Sales, Acme", "+1 415 555 0142"),
        ADA,
      );
      expect(sig).toBeNull();
    });
  });
});
