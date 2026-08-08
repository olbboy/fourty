import { describe, expect, it } from "vitest";
import {
  assess,
  bandFor,
  BAND_FLOORS,
  CONTRADICTION_CAP,
  dedupeEvidence,
  EVIDENCE_KINDS,
  hasPrimarySource,
  scoreEvidence,
  SCORE_CEILING,
  type Evidence,
} from "@/lib/facts/evidence";

/**
 * Evidence scoring (ADR-018). Pure: no database, no clock. These tests are what
 * makes a weight a decision rather than a tuning knob — changing one shows up
 * here as a diff, and the two facts most likely to be "fixed" for a demo (a lone
 * signature does not auto-fill; a contradiction holds rather than nudges) each
 * have a test that says so in its name.
 */
const e = (kind: keyof typeof EVIDENCE_KINDS, detail = "seen", sourceUrl?: string): Evidence => ({
  kind,
  detail,
  sourceUrl,
});

describe("combining independent observations", () => {
  it("is 1 − Π(1−w) over the entries", () => {
    // 1 − (1−0.8)(1−0.4) = 0.88
    expect(scoreEvidence([e("crm.signature-block"), e("web.cited-claim")])).toBe(0.88);
  });

  it("does not depend on the order they arrived in", () => {
    const kinds = ["crm.signature-block", "web.cited-claim", "handle.name-form"] as const;
    const forward = scoreEvidence(kinds.map((k, i) => e(k, `d${i}`)));
    const backward = scoreEvidence([...kinds].reverse().map((k, i) => e(k, `d${kinds.length - 1 - i}`)));
    expect(forward).toBe(backward);
  });

  it("never reaches certainty, however much agrees", () => {
    const piles = Array.from({ length: 12 }, (_, i) => e("profile.email-match", `mail ${i}`));
    expect(scoreEvidence(piles)).toBe(SCORE_CEILING);
  });

  it("scores nothing at all as zero", () => {
    expect(scoreEvidence([])).toBe(0);
  });
});

describe("one entry per independent source", () => {
  it("collapses the same page cited twice", () => {
    const url = "https://fernhill.example/team";
    const once = scoreEvidence([e("web.cited-claim", "the team page", url)]);
    const twice = scoreEvidence([
      e("web.cited-claim", "the team page", url),
      e("web.cited-claim", "the same page, other sentence", url),
    ]);
    expect(twice).toBe(once);
  });

  it("keeps two signatures from two different emails as two observations", () => {
    const two = dedupeEvidence([
      e("crm.signature-block", "their signature on 14 July"),
      e("crm.signature-block", "their signature on 2 August"),
    ]);
    expect(two).toHaveLength(2);
  });
});

describe("a contradiction holds the fact, it does not nudge it", () => {
  it("caps a strong claim below the proposal floor", () => {
    const strong = [e("profile.email-match"), e("crm.thread-reply")];
    expect(scoreEvidence(strong)).toBeGreaterThan(BAND_FLOORS.VERIFIED);
    const contradicted = scoreEvidence([...strong, e("contradiction", "their profile says another employer")]);
    expect(contradicted).toBe(CONTRADICTION_CAP);
    expect(contradicted).toBeLessThan(BAND_FLOORS.PROBABLE);
  });

  it("contributes nothing of its own to the product", () => {
    expect(scoreEvidence([e("contradiction")])).toBe(0);
  });
});

describe("bands are behaviour, not labels", () => {
  it("needs a primary source for VERIFIED, however high the score", () => {
    const supporting = [
      e("web.cited-claim", "the team page", "https://fernhill.example/team"),
      e("web.cited-claim", "a press release", "https://press.example/hire"),
      e("handle.name-form"),
      e("search.cites-profile"),
      e("employer-only"),
    ];
    const { score, band, hasPrimary } = assess(supporting);
    expect(hasPrimary).toBe(false);
    expect(score).toBeGreaterThan(BAND_FLOORS.VERIFIED);
    expect(band).toBe("PROBABLE");
  });

  it("stores nothing below the POSSIBLE floor", () => {
    expect(assess([e("employer-only")]).band).toBeNull();
  });

  it("puts a weak-but-real claim in POSSIBLE, which is stored and never shown", () => {
    expect(assess([e("web.cited-claim")]).band).toBe("POSSIBLE");
  });

  it("bandFor is a pure function of score and primacy", () => {
    expect(bandFor(0.9, true)).toBe("VERIFIED");
    expect(bandFor(0.9, false)).toBe("PROBABLE");
    expect(bandFor(0.55, false)).toBe("PROBABLE");
    expect(bandFor(0.3, false)).toBe("POSSIBLE");
    expect(bandFor(0.29, true)).toBeNull();
  });
});

describe("known and intended: a signature alone does not auto-fill", () => {
  it("leaves a lone signature at PROBABLE", () => {
    expect(assess([e("crm.signature-block")]).band).toBe("PROBABLE");
  });

  it("reaches VERIFIED once a second primary source agrees", () => {
    const { score, band } = assess([e("crm.signature-block"), e("profile.email-match")]);
    expect(score).toBe(0.99);
    expect(band).toBe("VERIFIED");
  });

  it("keeps the signature weight below the VERIFIED floor on purpose", () => {
    // If this fails because someone raised the weight, the fix is an amendment
    // with its own primary-kind allowlist rule — not a bigger number here.
    expect(EVIDENCE_KINDS["crm.signature-block"].weight).toBeLessThan(BAND_FLOORS.VERIFIED);
  });
});

describe("the reserved vendor kinds cannot auto-apply anything", () => {
  it("ships in the enum but counts as supporting", () => {
    expect(hasPrimarySource([e("linkedin.employer-and-name"), e("github.account-identity")])).toBe(false);
    expect(assess([e("linkedin.employer-and-name")]).band).toBe("PROBABLE");
  });
});
