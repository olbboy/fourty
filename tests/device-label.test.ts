import { describe, expect, it } from "vitest";
import { deviceLabel } from "@/lib/device-label";

/** A session's browser and system, readable at a glance on the account page. */
describe("device label", () => {
  it("names the browser and the system", () => {
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")).toBe("Chrome · macOS");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1")).toBe("Safari · iPhone");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0")).toBe("Edge · Windows");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 15) Gecko/20100101 Firefox/133.0")).toBe("Firefox · Android");
  });

  it("falls back to what it can tell, or nothing", () => {
    expect(deviceLabel("curl/8.7.1")).toBe("curl/8.7.1");
    expect(deviceLabel(null)).toBe("");
  });
});
