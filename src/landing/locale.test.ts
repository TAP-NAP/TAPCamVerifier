import { describe, expect, it } from "vitest";
import { landingCopy, resolveLandingLocale } from "./locale";

describe("landing locale", () => {
  it("prefers an explicit saved locale", () => {
    expect(resolveLandingLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveLandingLocale("zh", ["en-US"])).toBe("zh");
  });

  it("falls back to the browser language", () => {
    expect(resolveLandingLocale(null, ["ja-JP", "zh-Hans"])).toBe("zh");
    expect(resolveLandingLocale(null, ["en-US"])).toBe("en");
  });

  it("keeps the future privacy boundary explicit in both languages", () => {
    expect(landingCopy("zh", "privacy.body")).toContain("研发方向");
    expect(landingCopy("en", "privacy.body")).toContain("R&D");
  });
});
