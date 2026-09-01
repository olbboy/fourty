import { describe, expect, it } from "vitest";
import {
  daysSince,
  nextContactAction,
  nextDealAction,
  visibleBool,
  type ContactNextInput,
  type DealNextInput,
} from "@/lib/next-action";
import { t } from "@/lib/i18n";

const contact: ContactNextInput = {
  status: "lead",
  hasEmail: true,
  hasPhone: true,
  hasCompany: true,
  daysSinceLastActivity: 3,
  openDealCount: 0,
};

const deal: DealNextInput = {
  stageType: "open",
  daysInStage: 5,
  daysSinceUpdate: 2,
  isOverdue: false,
  hasContact: true,
};

describe("nextContactAction", () => {
  it("asks for a way to reach a blank profile first", () => {
    const s = nextContactAction({ ...contact, hasEmail: false, hasPhone: false });
    expect(s.action).toBe("nba.contact.addReach");
    expect(t("en", s.action)).toMatch(/email or phone/);
  });

  it("asks to link a company before chasing activity", () => {
    const s = nextContactAction({ ...contact, hasCompany: false });
    expect(s.action).toBe("nba.contact.linkCompany");
    expect(t("en", s.action)).toMatch(/company/i);
  });

  it("follows up a quiet open deal before generic nurture", () => {
    const s = nextContactAction({ ...contact, daysSinceLastActivity: 20, openDealCount: 1 });
    expect(s.action).toBe("nba.contact.followDeal");
    expect(t("en", s.action)).toMatch(/open deal/);
  });

  it("tells a qualified contact with no deal to create one", () => {
    const s = nextContactAction({ ...contact, status: "qualified" });
    expect(s.action).toBe("nba.contact.createDeal");
    expect(t("en", s.action)).toMatch(/Create a deal/);
  });

  it("does not treat a hidden status as a lead, customer, or churned band", () => {
    const suggestion = nextContactAction({ ...contact, status: null });
    expect(suggestion.action).toBe("nba.keepWarm");
    expect(t("en", suggestion.action)).toBe("Keep the record warm");
    expect(t("en", suggestion.action)).not.toMatch(/Qualify|referral|win-back|Create a deal/);
  });

  it("does not treat a hidden email or company as missing", () => {
    expect(t("en", nextContactAction({ ...contact, hasEmail: null, hasPhone: false }).action)).not.toMatch(
      /email or phone/,
    );
    expect(t("en", nextContactAction({ ...contact, hasCompany: null }).action)).not.toMatch(/company/i);
  });
});

describe("nextDealAction", () => {
  it("asks for a primary contact before anything else on an open deal", () => {
    const s = nextDealAction({ ...deal, hasContact: false });
    expect(s.action).toBe("nba.deal.linkContact");
    expect(t("en", s.action)).toMatch(/primary contact/);
  });

  it("flags an overdue close date", () => {
    const s = nextDealAction({ ...deal, isOverdue: true });
    expect(s.action).toBe("nba.deal.overdue");
    expect(t("en", s.action)).toMatch(/close date/);
  });

  it("closes the loop on a won deal", () => {
    const s = nextDealAction({ ...deal, stageType: "won" });
    expect(s.action).toBe("nba.deal.won");
    expect(t("en", s.action)).toMatch(/referral/);
  });

  it("does not treat an unknown stage as open", () => {
    const suggestion = nextDealAction({ ...deal, stageType: null });
    expect(suggestion.action).toBe("nba.keepWarm");
    expect(t("en", suggestion.action)).toBe("Keep the record warm");
    expect(t("en", suggestion.reason)).not.toMatch(/next stage|thank-you|loss reason/);
  });

  it("still asks for a contact when the stage is hidden but contactId is known empty", () => {
    const s = nextDealAction({ ...deal, stageType: null, hasContact: false });
    expect(s.action).toBe("nba.deal.linkContact");
    expect(t("en", s.action)).toMatch(/primary contact/);
  });

  it("does not ask to link a contact when contactId is hidden", () => {
    expect(t("en", nextDealAction({ ...deal, hasContact: null }).action)).not.toMatch(/primary contact/);
  });
});

describe("daysSince", () => {
  it("returns null for a missing timestamp and a non-negative day count otherwise", () => {
    expect(daysSince(null)).toBeNull();
    expect(daysSince(Date.now() - 3 * 86_400_000, Date.now())).toBe(3);
  });
});

describe("visibleBool", () => {
  it("treats a redacted key as unknown and a present null as false", () => {
    expect(visibleBool({ phone: "1" }, "email")).toBeNull();
    expect(visibleBool({ email: null }, "email")).toBe(false);
    expect(visibleBool({ email: "a@b.c" }, "email")).toBe(true);
  });
});
