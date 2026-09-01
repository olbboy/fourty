import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { factBandLabel, factFieldLabel } from "@/lib/fact-display";

describe("factBandLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates stored band tokens at display time", () => {
    expect(factBandLabel("VERIFIED", en)).toBe("Verified");
    expect(factBandLabel("PROBABLE", en)).toBe("Probable");
    expect(factBandLabel("POSSIBLE", en)).toBe("Possible");
    expect(factBandLabel("VERIFIED", vi)).toBe("Đã xác minh");
    expect(factBandLabel("PROBABLE", vi)).toBe("Khả năng cao");
    expect(factBandLabel("POSSIBLE", vi)).toBe("Có thể");
  });

  it("leaves unknown band tokens unchanged", () => {
    expect(factBandLabel("LIKELY", en)).toBe("LIKELY");
  });
});

describe("factFieldLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known fact field tokens", () => {
    expect(factFieldLabel("job_title", en)).toBe("Job title");
    expect(factFieldLabel("job_title", vi)).toBe("Chức danh");
    expect(factFieldLabel("company_id", vi)).toBe("Công ty");
    expect(factFieldLabel("linkedin", en)).toBe("LinkedIn");
  });

  it("leaves unknown field tokens unchanged", () => {
    expect(factFieldLabel("cf:abc", en)).toBe("cf:abc");
  });
});
